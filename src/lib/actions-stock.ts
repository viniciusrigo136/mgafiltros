'use server';
// Estoque: cadastro de itens e movimentações manuais (entrada, saída, inventário).
import { getDb, transaction } from './db';
import { requireEditor } from './auth';
import { STOCK_KINDS } from './stock';
import { ValidationError, number, text } from './validate';
import { done, guard, guardRedirect, type ActionState } from './action-utils';

export async function saveStockItem(_: ActionState, fd: FormData): Promise<ActionState> {
  let itemId = Number(fd.get('id')) || 0;
  const r = await guard(async () => {
    const user = await requireEditor();
    const kind = String(fd.get('kind') ?? '');
    if (!(STOCK_KINDS as readonly string[]).includes(kind)) throw new ValidationError('Selecione o tipo do item.');
    const code = text(fd, 'reference_code', 'Código / referência', { required: true, max: 80 })!;
    const description = text(fd, 'description', 'Descrição', { max: 200 });
    const manufacturer = text(fd, 'manufacturer', 'Fabricante', { max: 80 });
    const unit = text(fd, 'unit', 'Unidade', { max: 10 }) ?? 'un';
    const min = number(fd, 'min_quantity', 'Estoque mínimo', { max: 1_000_000 }) ?? 0;
    const cost = number(fd, 'cost_price', 'Preço de custo', { max: 10_000_000 });
    const sale = number(fd, 'sale_price', 'Preço de venda', { max: 10_000_000 });
    const location = text(fd, 'location', 'Localização', { max: 80 });
    const db = getDb();
    transaction(db, () => {
      if (itemId) {
        db.prepare(
          `UPDATE stock_items SET kind = ?, reference_code = ?, description = ?, manufacturer = ?, unit = ?, min_quantity = ?,
             cost_price = ?, sale_price = ?, location = ? WHERE id = ?`,
        ).run(kind, code, description, manufacturer, unit, min, cost, sale, location, itemId);
      } else {
        itemId = Number(
          db.prepare(
            `INSERT INTO stock_items (kind, reference_code, description, manufacturer, unit, min_quantity, cost_price, sale_price, location)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(kind, code, description, manufacturer, unit, min, cost, sale, location).lastInsertRowid,
        );
        const initial = number(fd, 'initial_quantity', 'Quantidade inicial', { max: 1_000_000 });
        if (initial) db.prepare('INSERT INTO stock_movements (item_id, delta, reason, created_by) VALUES (?, ?, ?, ?)').run(itemId, initial, 'Saldo inicial', user.id);
      }
    });
  });
  if (r) return r;
  done(`/estoque/${itemId}`, 'Item salvo.');
}

/** Entrada, saída ou inventário (define o saldo contado). */
export async function moveStock(_: ActionState, fd: FormData): Promise<ActionState> {
  const itemId = Number(fd.get('item_id'));
  const r = await guard(async () => {
    const user = await requireEditor();
    const type = String(fd.get('type'));
    const qty = number(fd, 'quantity', 'Quantidade', { required: true, max: 1_000_000 })!;
    const reason = text(fd, 'reason', 'Motivo', { max: 200 });
    const db = getDb();
    const { balance } = db.prepare('SELECT coalesce(sum(delta), 0) AS balance FROM stock_movements WHERE item_id = ?').get(itemId) as { balance: number };
    let delta: number;
    let label: string;
    if (type === 'entrada') { delta = qty; label = reason ?? 'Entrada (compra)'; }
    else if (type === 'saida') { delta = -qty; label = reason ?? 'Saída avulsa'; }
    else if (type === 'inventario') { delta = qty - balance; label = `Inventário${reason ? `: ${reason}` : ''}`; }
    else throw new ValidationError('Tipo de movimentação inválido.');
    if (type !== 'inventario' && qty <= 0) throw new ValidationError('Quantidade deve ser maior que zero.');
    if (delta === 0) throw new ValidationError('O saldo contado é igual ao saldo atual; nada a ajustar.');
    db.prepare('INSERT INTO stock_movements (item_id, delta, reason, created_by) VALUES (?, ?, ?, ?)').run(itemId, delta, label, user.id);
  });
  if (r) return r;
  done(`/estoque/${itemId}`, 'Movimentação registrada.');
}

export async function setStockItemActive(fd: FormData) {
  const itemId = Number(fd.get('id'));
  const active = fd.get('active') === '1' ? 1 : 0;
  await guardRedirect(`/estoque/${itemId}`, async () => {
    await requireEditor();
    getDb().prepare('UPDATE stock_items SET is_active = ? WHERE id = ?').run(active, itemId);
  });
  done(`/estoque/${itemId}`, active ? 'Item reativado.' : 'Item inativado.');
}
