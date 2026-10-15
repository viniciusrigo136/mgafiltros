'use server';
// Ordens de serviço: abertura, itens (peças/serviços), checklist e mudança de situação.
// Ao concluir, peças vinculadas ao estoque são baixadas; ao reabrir/cancelar, o estoque é devolvido.
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { getDb, transaction, type Db } from './db';
import { uploadsDir } from './attachments';
import { requireAdmin, requireEditor } from './auth';
import { getSettings } from './settings';
import { todayInTimeZone } from './status';
import { WO_STATUSES, type WoStatus } from './orders';
import { filterTypeLabel } from './format';
import { ValidationError, date, id, number, text } from './validate';
import { done, guard, guardRedirect, type ActionState } from './action-utils';

function nextOrderNumber(db: Db): number {
  return (db.prepare("UPDATE sequences SET value = value + 1 WHERE name = 'work_order_number' RETURNING value").get() as { value: number }).value;
}

function deductItem(db: Db, itemId: number, stockItemId: number, qty: number, number: number, userId: number | null) {
  db.prepare('INSERT INTO stock_movements (item_id, delta, reason, work_order_item_id, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(stockItemId, -qty, `OS nº ${number}`, itemId, userId);
}

export async function createOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  let orderId = 0;
  const r = await guard(async () => {
    const user = await requireEditor();
    const tractorId = id(fd, 'tractor_id', 'Trator');
    const complaint = text(fd, 'complaint', 'Solicitação do cliente', { max: 2000 });
    const withOil = fd.get('with_oil') === '1';
    const db = getDb();
    const t = db.prepare('SELECT id, current_hours, oil_spec, oil_capacity_liters FROM tractors WHERE id = ?').get(tractorId) as
      { id: number; current_hours: number | null; oil_spec: string | null; oil_capacity_liters: number | null } | undefined;
    if (!t) throw new ValidationError('Trator não encontrado.');
    const { checklist } = getSettings();
    transaction(db, () => {
      const num = nextOrderNumber(db);
      orderId = Number(
        db.prepare(
          `INSERT INTO work_orders (number, tractor_id, opened_at, hours_at_open, complaint, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(num, tractorId, todayInTimeZone(), t.current_hours, complaint, user.id).lastInsertRowid,
      );
      const ins = db.prepare('INSERT INTO work_order_checklist (work_order_id, label, position) VALUES (?, ?, ?)');
      checklist.forEach((label, i) => ins.run(orderId, label, i));
      if (withOil) {
        // Pré-carrega as peças da troca de óleo com preço de venda do estoque (se cadastrado).
        const find = db.prepare('SELECT id, sale_price, description FROM stock_items WHERE reference_code = ? AND is_active = 1');
        const add = db.prepare(
          'INSERT INTO work_order_items (work_order_id, kind, description, reference_code, stock_item_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
        );
        const filters = db.prepare('SELECT filter_type, reference_code, quantity FROM tractor_filters WHERE tractor_id = ? ORDER BY id').all(tractorId) as
          { filter_type: string; reference_code: string; quantity: number }[];
        for (const f of filters) {
          const s = find.get(f.reference_code) as { id: number; sale_price: number | null; description: string | null } | undefined;
          add.run(orderId, 'peca', s?.description ?? `Filtro ${filterTypeLabel(f.filter_type).toLowerCase()}`, f.reference_code, s?.id ?? null, f.quantity, s?.sale_price ?? 0);
        }
        if (t.oil_spec) {
          const s = find.get(t.oil_spec) as { id: number; sale_price: number | null; description: string | null } | undefined;
          add.run(orderId, 'peca', s?.description ?? `Óleo do motor ${t.oil_spec}`, t.oil_spec, s?.id ?? null, t.oil_capacity_liters ?? 1, s?.sale_price ?? 0);
        }
        add.run(orderId, 'servico', 'Mão de obra — troca de óleo e filtros', null, null, 1, 0);
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
    getDb()
      .prepare('UPDATE work_orders SET opened_at = ?, hours_at_open = ?, complaint = ?, diagnosis = ?, notes = ?, discount = ? WHERE id = ?')
      .run(openedAt, hours, complaint, diagnosis, notes, discount, orderId);
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
    const db = getDb();
    const order = db.prepare('SELECT number, status FROM work_orders WHERE id = ?').get(orderId) as { number: number; status: WoStatus } | undefined;
    if (!order) throw new ValidationError('OS não encontrada.');
    if (order.status === 'cancelada') throw new ValidationError('OS cancelada não pode ser alterada.');
    let stockId: number | null = null;
    if (kind === 'peca' && code) {
      const s = db.prepare('SELECT id, description, sale_price FROM stock_items WHERE reference_code = ? AND is_active = 1').get(code) as
        { id: number; description: string | null; sale_price: number | null } | undefined;
      if (s) {
        stockId = s.id;
        description ??= s.description;
        price ??= s.sale_price;
      }
    }
    if (!description) throw new ValidationError('Informe a descrição (ou um código cadastrado no estoque).');
    transaction(db, () => {
      const itemId = Number(
        db.prepare(
          'INSERT INTO work_order_items (work_order_id, kind, description, reference_code, stock_item_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(orderId, kind, description, code, stockId, qty, price ?? 0).lastInsertRowid,
      );
      if (order.status === 'concluida' && stockId) deductItem(db, itemId, stockId, qty, order.number, user.id);
    });
  });
  if (r) return r;
  done(`/ordens/${orderId}#itens`, 'Item adicionado.');
}

export async function removeOrderItem(fd: FormData) {
  const orderId = Number(fd.get('work_order_id'));
  await guardRedirect(`/ordens/${orderId}`, async () => {
    await requireEditor();
    // Movimentação de estoque ligada ao item é removida em cascata (devolve o estoque).
    getDb().prepare('DELETE FROM work_order_items WHERE id = ? AND work_order_id = ?').run(Number(fd.get('id')), orderId);
  });
  done(`/ordens/${orderId}#itens`, 'Item removido.');
}

export async function toggleChecklist(fd: FormData) {
  const orderId = Number(fd.get('work_order_id'));
  await guardRedirect(`/ordens/${orderId}`, async () => {
    await requireEditor();
    getDb()
      .prepare('UPDATE work_order_checklist SET done = ? WHERE id = ? AND work_order_id = ?')
      .run(fd.get('done') === '1' ? 1 : 0, Number(fd.get('id')), orderId);
  });
  done(`/ordens/${orderId}#checklist`, 'Checklist atualizado.');
}

export async function addChecklistItem(fd: FormData) {
  const orderId = Number(fd.get('work_order_id'));
  await guardRedirect(`/ordens/${orderId}`, async () => {
    await requireEditor();
    const label = text(fd, 'label', 'Item do checklist', { required: true, max: 200 })!;
    getDb()
      .prepare(
        'INSERT INTO work_order_checklist (work_order_id, label, position) VALUES (?, ?, (SELECT coalesce(max(position), 0) + 1 FROM work_order_checklist WHERE work_order_id = ?))',
      )
      .run(orderId, label, orderId);
  });
  done(`/ordens/${orderId}#checklist`, 'Item incluído no checklist.');
}

export async function setOrderStatus(fd: FormData) {
  const orderId = Number(fd.get('id'));
  const status = String(fd.get('status')) as WoStatus;
  await guardRedirect(`/ordens/${orderId}`, async () => {
    const user = await requireEditor();
    if (!WO_STATUSES.includes(status)) throw new ValidationError('Situação inválida.');
    const db = getDb();
    const order = db.prepare('SELECT number, status FROM work_orders WHERE id = ?').get(orderId) as { number: number; status: WoStatus } | undefined;
    if (!order) throw new ValidationError('OS não encontrada.');
    transaction(db, () => {
      if (status === 'concluida' && order.status !== 'concluida') {
        const items = db
          .prepare(
            `SELECT id, stock_item_id, quantity FROM work_order_items
             WHERE work_order_id = ? AND stock_item_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.work_order_item_id = work_order_items.id)`,
          )
          .all(orderId) as { id: number; stock_item_id: number; quantity: number }[];
        for (const i of items) deductItem(db, i.id, i.stock_item_id, i.quantity, order.number, user.id);
        db.prepare('UPDATE work_orders SET status = ?, closed_at = ? WHERE id = ?').run(status, todayInTimeZone(), orderId);
      } else if (status !== 'concluida' && order.status === 'concluida') {
        db.prepare(
          'DELETE FROM stock_movements WHERE work_order_item_id IN (SELECT id FROM work_order_items WHERE work_order_id = ?)',
        ).run(orderId);
        db.prepare('UPDATE work_orders SET status = ?, closed_at = NULL WHERE id = ?').run(status, orderId);
      } else {
        db.prepare('UPDATE work_orders SET status = ? WHERE id = ?').run(status, orderId);
      }
    });
  });
  done(`/ordens/${orderId}`, status === 'concluida' ? 'OS concluída. Peças do estoque baixadas.' : 'Situação da OS atualizada.');
}

export async function deleteOrder(fd: FormData) {
  const orderId = Number(fd.get('id'));
  await guardRedirect(`/ordens/${orderId}`, async () => {
    await requireAdmin();
    const db = getDb();
    const o = db.prepare('SELECT status FROM work_orders WHERE id = ?').get(orderId) as { status: WoStatus } | undefined;
    if (o?.status === 'concluida') throw new ValidationError('OS concluída não pode ser excluída. Reabra ou cancele antes.');
    const files = db.prepare('SELECT stored_name FROM attachments WHERE work_order_id = ?').all(orderId) as { stored_name: string }[];
    db.prepare('DELETE FROM work_orders WHERE id = ?').run(orderId);
    // Anexos saem do banco em cascata; remove também os arquivos do disco.
    await Promise.all(files.map((f) => unlink(path.join(uploadsDir(), f.stored_name)).catch(() => undefined)));
  });
  done('/ordens', 'OS excluída.');
}
