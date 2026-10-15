'use server';
// Ordens de serviço: abertura, itens (peças/serviços), checklist e mudança de situação.
// Ao concluir, peças vinculadas ao estoque são baixadas; ao reabrir/cancelar, o estoque é devolvido.
import { getDb, transaction, type Db } from './db';
import { removeFile } from './attachments';
import { requireAdmin, requireEditor } from './auth';
import { getSettings } from './settings';
import { todayInTimeZone } from './status';
import { WO_STATUSES, type WoStatus } from './orders';
import { filterTypeLabel } from './format';
import { ValidationError, date, id, number, text } from './validate';
import { done, guard, guardRedirect, type ActionState } from './action-utils';

async function nextOrderNumber(tx: Db): Promise<number> {
  const row = await tx.get<{ value: number }>("UPDATE sequences SET value = value + 1 WHERE name = 'work_order_number' RETURNING value");
  return row!.value;
}

function deductItem(tx: Db, itemId: number, stockItemId: number, qty: number, number: number, userId: number | null) {
  return tx.run(
    'INSERT INTO stock_movements (item_id, delta, reason, work_order_item_id, created_by) VALUES (?, ?, ?, ?, ?)',
    stockItemId, -qty, `OS nº ${number}`, itemId, userId,
  );
}

type StockRef = { id: number; sale_price: number | null; description: string | null };

export async function createOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  let orderId = 0;
  const r = await guard(async () => {
    const user = await requireEditor();
    const tractorId = id(fd, 'tractor_id', 'Trator');
    const complaint = text(fd, 'complaint', 'Solicitação do cliente', { max: 2000 });
    const withOil = fd.get('with_oil') === '1';
    const { checklist } = await getSettings();
    await transaction(async (tx) => {
      const t = await tx.get<{ id: number; current_hours: number | null; oil_spec: string | null; oil_capacity_liters: number | null }>(
        'SELECT id, current_hours, oil_spec, oil_capacity_liters FROM tractors WHERE id = ?', tractorId,
      );
      if (!t) throw new ValidationError('Trator não encontrado.');
      const num = await nextOrderNumber(tx);
      orderId = (await tx.run(
        'INSERT INTO work_orders (number, tractor_id, opened_at, hours_at_open, complaint, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        num, tractorId, todayInTimeZone(), t.current_hours, complaint, user.id,
      )).lastInsertRowid;
      for (const [i, label] of checklist.entries()) {
        await tx.run('INSERT INTO work_order_checklist (work_order_id, label, position) VALUES (?, ?, ?)', orderId, label, i);
      }
      if (withOil) {
        // Pré-carrega as peças da troca de óleo com preço de venda do estoque (se cadastrado).
        const find = (code: string) => tx.get<StockRef>('SELECT id, sale_price, description FROM stock_items WHERE reference_code = ? AND is_active = 1', code);
        const add = (desc: string, code: string | null, stockId: number | null, qty: number, price: number, kind = 'peca') =>
          tx.run(
            'INSERT INTO work_order_items (work_order_id, kind, description, reference_code, stock_item_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
            orderId, kind, desc, code, stockId, qty, price,
          );
        const filters = await tx.all<{ filter_type: string; reference_code: string; quantity: number }>(
          'SELECT filter_type, reference_code, quantity FROM tractor_filters WHERE tractor_id = ? ORDER BY id', tractorId,
        );
        for (const f of filters) {
          const s = await find(f.reference_code);
          await add(s?.description ?? `Filtro ${filterTypeLabel(f.filter_type).toLowerCase()}`, f.reference_code, s?.id ?? null, f.quantity, s?.sale_price ?? 0);
        }
        if (t.oil_spec) {
          const s = await find(t.oil_spec);
          await add(s?.description ?? `Óleo do motor ${t.oil_spec}`, t.oil_spec, s?.id ?? null, t.oil_capacity_liters ?? 1, s?.sale_price ?? 0);
        }
        await add('Mão de obra — troca de óleo e filtros', null, null, 1, 0, 'servico');
      }
    });
  });
  if (r) return r;
  done(`/ordens/${orderId}`, 'Ordem de serviço aberta.');
}

export async function saveOrderHeader(_: ActionState, fd: FormData): Promise<ActionState> {
  const orderId = Number(fd.get('id'));
  const r = await guard(async () => {
    await requireEditor();
    const openedAt = date(fd, 'opened_at', 'Data de abertura', { required: true, notAfter: todayInTimeZone() })!;
    const hours = number(fd, 'hours_at_open', 'Horímetro na entrada', { max: 1_000_000 });
    const complaint = text(fd, 'complaint', 'Solicitação do cliente', { max: 2000 });
    const diagnosis = text(fd, 'diagnosis', 'Diagnóstico', { max: 4000 });
    const notes = text(fd, 'notes', 'Observações', { max: 2000 });
    const discount = number(fd, 'discount', 'Desconto', { max: 10_000_000 }) ?? 0;
    await (await getDb()).run(
      'UPDATE work_orders SET opened_at = ?, hours_at_open = ?, complaint = ?, diagnosis = ?, notes = ?, discount = ? WHERE id = ?',
      openedAt, hours, complaint, diagnosis, notes, discount, orderId,
    );
  });
  if (r) return r;
  done(`/ordens/${orderId}`, 'Dados da OS salvos.');
}

export async function addOrderItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const orderId = Number(fd.get('work_order_id'));
  const r = await guard(async () => {
    const user = await requireEditor();
    const kind = fd.get('kind') === 'servico' ? 'servico' : 'peca';
    const code = text(fd, 'reference_code', 'Código', { max: 80 });
    let description = text(fd, 'description', 'Descrição', { max: 200 });
    const qty = number(fd, 'quantity', 'Quantidade', { required: true, positive: true, max: 100_000 })!;
    let price = number(fd, 'unit_price', 'Valor unitário', { max: 10_000_000 });
    await transaction(async (tx) => {
      const order = await tx.get<{ number: number; status: WoStatus }>('SELECT number, status FROM work_orders WHERE id = ?', orderId);
      if (!order) throw new ValidationError('OS não encontrada.');
      if (order.status === 'cancelada') throw new ValidationError('OS cancelada não pode ser alterada.');
      let stockId: number | null = null;
      if (kind === 'peca' && code) {
        const s = await tx.get<StockRef>('SELECT id, description, sale_price FROM stock_items WHERE reference_code = ? AND is_active = 1', code);
        if (s) {
          stockId = s.id;
          description ??= s.description;
          price ??= s.sale_price;
        }
      }
      if (!description) throw new ValidationError('Informe a descrição (ou um código cadastrado no estoque).');
      const itemId = (await tx.run(
        'INSERT INTO work_order_items (work_order_id, kind, description, reference_code, stock_item_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
        orderId, kind, description, code, stockId, qty, price ?? 0,
      )).lastInsertRowid;
      if (order.status === 'concluida' && stockId) await deductItem(tx, itemId, stockId, qty, order.number, user.id);
    });
  });
  if (r) return r;
  done(`/ordens/${orderId}#itens`, 'Item adicionado.');
}

export async function removeOrderItem(fd: FormData) {
  const orderId = Number(fd.get('work_order_id'));
  const itemId = Number(fd.get('id'));
  await guardRedirect(`/ordens/${orderId}`, async () => {
    await requireEditor();
    await transaction(async (tx) => {
      if (!(await tx.get('SELECT 1 AS ok FROM work_order_items WHERE id = ? AND work_order_id = ?', itemId, orderId))) return;
      // Remove a baixa de estoque ligada ao item (devolve o estoque).
      await tx.run('DELETE FROM stock_movements WHERE work_order_item_id = ?', itemId);
      await tx.run('DELETE FROM work_order_items WHERE id = ?', itemId);
    });
  });
  done(`/ordens/${orderId}#itens`, 'Item removido.');
}

export async function toggleChecklist(fd: FormData) {
  const orderId = Number(fd.get('work_order_id'));
  await guardRedirect(`/ordens/${orderId}`, async () => {
    await requireEditor();
    await (await getDb()).run(
      'UPDATE work_order_checklist SET done = ? WHERE id = ? AND work_order_id = ?',
      fd.get('done') === '1' ? 1 : 0, Number(fd.get('id')), orderId,
    );
  });
  done(`/ordens/${orderId}#checklist`, 'Checklist atualizado.');
}

export async function addChecklistItem(fd: FormData) {
  const orderId = Number(fd.get('work_order_id'));
  await guardRedirect(`/ordens/${orderId}`, async () => {
    await requireEditor();
    const label = text(fd, 'label', 'Item do checklist', { required: true, max: 200 })!;
    await (await getDb()).run(
      'INSERT INTO work_order_checklist (work_order_id, label, position) VALUES (?, ?, (SELECT coalesce(max(position), 0) + 1 FROM work_order_checklist WHERE work_order_id = ?))',
      orderId, label, orderId,
    );
  });
  done(`/ordens/${orderId}#checklist`, 'Item incluído no checklist.');
}

export async function setOrderStatus(fd: FormData) {
  const orderId = Number(fd.get('id'));
  const status = String(fd.get('status')) as WoStatus;
  await guardRedirect(`/ordens/${orderId}`, async () => {
    const user = await requireEditor();
    if (!WO_STATUSES.includes(status)) throw new ValidationError('Situação inválida.');
    await transaction(async (tx) => {
      const order = await tx.get<{ number: number; status: WoStatus }>('SELECT number, status FROM work_orders WHERE id = ?', orderId);
      if (!order) throw new ValidationError('OS não encontrada.');
      if (status === 'concluida' && order.status !== 'concluida') {
        const items = await tx.all<{ id: number; stock_item_id: number; quantity: number }>(
          `SELECT id, stock_item_id, quantity FROM work_order_items
           WHERE work_order_id = ? AND stock_item_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.work_order_item_id = work_order_items.id)`,
          orderId,
        );
        for (const i of items) await deductItem(tx, i.id, i.stock_item_id, i.quantity, order.number, user.id);
        await tx.run('UPDATE work_orders SET status = ?, closed_at = ? WHERE id = ?', status, todayInTimeZone(), orderId);
      } else if (status !== 'concluida' && order.status === 'concluida') {
        await tx.run('DELETE FROM stock_movements WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ?)', orderId);
        await tx.run('UPDATE work_orders SET status = ?, closed_at = NULL WHERE id = ?', status, orderId);
      } else {
        await tx.run('UPDATE work_orders SET status = ? WHERE id = ?', status, orderId);
      }
    });
  });
  done(`/ordens/${orderId}`, status === 'concluida' ? 'OS concluída. Peças do estoque baixadas.' : 'Situação da OS atualizada.');
}

export async function deleteOrder(fd: FormData) {
  const orderId = Number(fd.get('id'));
  await guardRedirect(`/ordens/${orderId}`, async () => {
    await requireAdmin();
    const files = await transaction(async (tx) => {
      const o = await tx.get<{ status: WoStatus }>('SELECT status FROM work_orders WHERE id = ?', orderId);
      if (o?.status === 'concluida') throw new ValidationError('OS concluída não pode ser excluída. Reabra ou cancele antes.');
      const stored = await tx.all<{ stored_name: string }>('SELECT stored_name FROM attachments WHERE work_order_id = ?', orderId);
      // Exclusões explícitas (não depende de ON DELETE CASCADE estar ativo na conexão).
      await tx.run('DELETE FROM stock_movements WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ?)', orderId);
      await tx.run('DELETE FROM work_order_items WHERE work_order_id = ?', orderId);
      await tx.run('DELETE FROM work_order_checklist WHERE work_order_id = ?', orderId);
      await tx.run('DELETE FROM attachments WHERE work_order_id = ?', orderId);
      await tx.run('UPDATE oil_changes SET work_order_id = NULL WHERE work_order_id = ?', orderId);
      await tx.run('UPDATE maintenance_records SET work_order_id = NULL WHERE work_order_id = ?', orderId);
      await tx.run('DELETE FROM work_orders WHERE id = ?', orderId);
      return stored;
    });
    await Promise.all(files.map((f) => removeFile(f.stored_name)));
  });
  done('/ordens', 'OS excluída.');
}
