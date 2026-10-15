// Estoque: saldo = soma das movimentações.
import { getDb } from './db';

export const STOCK_KINDS = ['filtro', 'oleo', 'peca', 'outro'] as const;
export type StockKind = (typeof STOCK_KINDS)[number];
export const STOCK_KIND_LABEL: Record<StockKind, string> = { filtro: 'Filtro', oleo: 'Óleo', peca: 'Peça', outro: 'Outro' };

export interface StockItem {
  id: number;
  kind: StockKind;
  reference_code: string;
  description: string | null;
  manufacturer: string | null;
  unit: string;
  min_quantity: number;
  cost_price: number | null;
  sale_price: number | null;
  location: string | null;
  is_active: number;
  balance: number;
}

const BALANCE = '(SELECT coalesce(sum(delta), 0) FROM stock_movements m WHERE m.item_id = s.id)';

export async function listStock(opts: { q?: string; kind?: string; low?: boolean; includeInactive?: boolean } = {}): Promise<StockItem[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (!opts.includeInactive) where.push('s.is_active = 1');
  if (opts.kind && (STOCK_KINDS as readonly string[]).includes(opts.kind)) { where.push('s.kind = ?'); params.push(opts.kind); }
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim()}%`;
    where.push('(s.reference_code LIKE ? OR s.description LIKE ? OR s.manufacturer LIKE ? OR s.location LIKE ?)');
    params.push(like, like, like, like);
  }
  if (opts.low) where.push(`${BALANCE} <= s.min_quantity`);
  return (await getDb()).all<StockItem>(
    `SELECT s.*, ${BALANCE} AS balance FROM stock_items s ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY s.kind, s.reference_code COLLATE NOCASE`,
    ...params,
  );
}

export async function getStockItem(id: number): Promise<StockItem | null> {
  return (await (await getDb()).get<StockItem>(`SELECT s.*, ${BALANCE} AS balance FROM stock_items s WHERE s.id = ?`, id)) ?? null;
}

export async function lowStockCount(): Promise<number> {
  const row = await (await getDb()).get<{ n: number }>(
    `SELECT count(*) AS n FROM stock_items s WHERE s.is_active = 1 AND s.min_quantity > 0 AND ${BALANCE} <= s.min_quantity`,
  );
  return row?.n ?? 0;
}

export interface Movement {
  id: number;
  delta: number;
  reason: string;
  created_at: string;
  oil_change_id: number | null;
  tractor_id: number | null;
  work_order_id: number | null;
  work_order_number: number | null;
}

export async function listMovements(itemId: number, limit = 50): Promise<Movement[]> {
  return (await getDb()).all<Movement>(
    `SELECT m.id, m.delta, m.reason, m.created_at, m.oil_change_id,
            coalesce(oc.tractor_id, wo.tractor_id) AS tractor_id, wo.id AS work_order_id, wo.number AS work_order_number
     FROM stock_movements m
     LEFT JOIN oil_changes oc ON oc.id = m.oil_change_id
     LEFT JOIN work_order_items wi ON wi.id = m.work_order_item_id
     LEFT JOIN work_orders wo ON wo.id = wi.work_order_id
     WHERE m.item_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
    itemId, limit,
  );
}

/** Saldo por código de referência (sem diferenciar maiúsculas). */
export async function balancesByCode(codes: string[]): Promise<Map<string, { id: number; balance: number; unit: string }>> {
  const map = new Map<string, { id: number; balance: number; unit: string }>();
  const unique = [...new Set(codes.filter(Boolean))];
  if (!unique.length) return map;
  const rows = await (await getDb()).all<{ id: number; reference_code: string; unit: string; balance: number }>(
    `SELECT s.id, s.reference_code, s.unit, ${BALANCE} AS balance FROM stock_items s
     WHERE s.is_active = 1 AND s.reference_code IN (${unique.map(() => '?').join(',')})`,
    ...unique,
  );
  for (const r of rows) map.set(r.reference_code.toLowerCase(), { id: r.id, balance: r.balance, unit: r.unit });
  return map;
}

export interface PartNeed { label: string; code: string; needed: number; balance: number | null; unit: string; ok: boolean; itemId: number | null }

/** Peças necessárias para a próxima troca de óleo e disponibilidade no estoque. */
export async function partsForNextChange(
  filters: { filter_type: string; reference_code: string; quantity: number }[],
  oil: { spec: string | null; liters: number | null },
  typeLabel: (t: string) => string,
): Promise<PartNeed[]> {
  const needs: Omit<PartNeed, 'balance' | 'ok' | 'itemId' | 'unit'>[] = filters.map((f) => ({
    label: `Filtro ${typeLabel(f.filter_type).toLowerCase()}`, code: f.reference_code, needed: f.quantity,
  }));
  if (oil.spec) needs.push({ label: 'Óleo do motor', code: oil.spec, needed: oil.liters ?? 0 });
  const balances = await balancesByCode(needs.map((n) => n.code));
  return needs.map((n) => {
    const b = balances.get(n.code.toLowerCase());
    return { ...n, balance: b?.balance ?? null, unit: b?.unit ?? '', itemId: b?.id ?? null, ok: b != null && b.balance >= n.needed };
  });
}
