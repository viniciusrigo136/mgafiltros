// Ordens de serviço / orçamentos.
import { getDb } from './db';
import { orderTotals } from './money';

export const WO_STATUSES = ['orcamento', 'aprovada', 'em_execucao', 'concluida', 'cancelada'] as const;
export type WoStatus = (typeof WO_STATUSES)[number];
export const WO_STATUS_LABEL: Record<WoStatus, string> = {
  orcamento: 'Orçamento',
  aprovada: 'Aprovada',
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};
export const OPEN_STATUSES: WoStatus[] = ['orcamento', 'aprovada', 'em_execucao'];

export interface WorkOrder {
  id: number;
  number: number;
  tractor_id: number;
  status: WoStatus;
  opened_at: string;
  closed_at: string | null;
  hours_at_open: number | null;
  complaint: string | null;
  diagnosis: string | null;
  notes: string | null;
  discount: number;
  sequential_number: number;
  brand: string;
  model: string;
  serial_number: string | null;
  owner_id: number;
  owner_name: string;
  owner_phone: string | null;
  owner_city: string | null;
  gross: number;
}

export interface WorkOrderItem {
  id: number;
  kind: 'peca' | 'servico';
  description: string;
  reference_code: string | null;
  stock_item_id: number | null;
  quantity: number;
  unit_price: number;
  deducted: number;
}

export interface ChecklistItem { id: number; label: string; done: number; position: number }

const SELECT = `
  SELECT w.*, t.sequential_number, t.brand, t.model, t.serial_number, t.owner_id,
         o.name AS owner_name, o.phone AS owner_phone, o.city AS owner_city,
         (SELECT coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) FROM work_order_items i WHERE i.work_order_id = w.id) AS gross
  FROM work_orders w
  JOIN tractors t ON t.id = w.tractor_id
  JOIN owners o ON o.id = t.owner_id`;

export function listOrders(opts: { status?: string; q?: string; tractorId?: number; open?: boolean; limit?: number } = {}): WorkOrder[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.status && (WO_STATUSES as readonly string[]).includes(opts.status)) { where.push('w.status = ?'); params.push(opts.status); }
  if (opts.open) where.push(`w.status IN (${OPEN_STATUSES.map((s) => `'${s}'`).join(',')})`);
  if (opts.tractorId) { where.push('w.tractor_id = ?'); params.push(opts.tractorId); }
  const q = opts.q?.trim();
  if (q) {
    if (/^\d+$/.test(q)) { where.push('(w.number = ? OR t.sequential_number = ?)'); params.push(Number(q), Number(q)); }
    else {
      const like = `%${q}%`;
      where.push('(o.name LIKE ? OR t.brand LIKE ? OR t.model LIKE ? OR w.complaint LIKE ?)');
      params.push(like, like, like, like);
    }
  }
  return getDb()
    .prepare(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY w.number DESC LIMIT ${Math.min(opts.limit ?? 200, 500)}`)
    .all(...params) as unknown as WorkOrder[];
}

export function getOrder(id: number) {
  const db = getDb();
  const order = db.prepare(`${SELECT} WHERE w.id = ?`).get(id) as unknown as WorkOrder | undefined;
  if (!order) return null;
  const items = db
    .prepare(
      `SELECT i.*, EXISTS (SELECT 1 FROM stock_movements m WHERE m.work_order_item_id = i.id) AS deducted
       FROM work_order_items i WHERE i.work_order_id = ? ORDER BY i.kind, i.id`,
    )
    .all(id) as unknown as WorkOrderItem[];
  const checklist = db
    .prepare('SELECT * FROM work_order_checklist WHERE work_order_id = ? ORDER BY position, id')
    .all(id) as unknown as ChecklistItem[];
  return { order, items, checklist, totals: orderTotals(items, order.discount) };
}

export function openOrdersCount(): number {
  return (getDb()
    .prepare(`SELECT count(*) AS n FROM work_orders WHERE status IN (${OPEN_STATUSES.map((s) => `'${s}'`).join(',')})`)
    .get() as { n: number }).n;
}
