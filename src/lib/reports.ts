// Indicadores por período para a tela Relatórios.
import { getDb } from './db';
import { addMonths } from './status';

export interface PeriodReport {
  oilChanges: number;
  otherServices: number;
  ordersClosed: number;
  revenue: number;
  ordersOpened: number;
  byMonth: { month: string; oil: number; other: number; revenue: number }[];
  topFilters: { code: string; type: string; qty: number }[];
  topParts: { description: string; code: string | null; qty: number; value: number }[];
  topOwners: { id: number; name: string; services: number }[];
}

/** Valor líquido de cada OS concluída (itens − desconto, nunca negativo). */
const ORDER_NET = `
  SELECT w.closed_at AS d,
         max(0, coalesce((SELECT sum(round(i.quantity * i.unit_price, 2)) FROM work_order_items i WHERE i.work_order_id = w.id), 0) - w.discount) AS v
  FROM work_orders w WHERE w.status = 'concluida' AND w.closed_at BETWEEN ? AND ?`;

export async function periodReport(from: string, to: string): Promise<PeriodReport> {
  const db = await getDb();
  const [oilByMonth, otherByMonth, revenueByMonth, opened, topFilters, topParts, topOwners] = await Promise.all([
    db.all<{ m: string; n: number }>("SELECT substr(serviced_at, 1, 7) AS m, count(*) AS n FROM oil_changes WHERE serviced_at BETWEEN ? AND ? GROUP BY m", from, to),
    db.all<{ m: string; n: number }>("SELECT substr(serviced_at, 1, 7) AS m, count(*) AS n FROM maintenance_records WHERE serviced_at BETWEEN ? AND ? GROUP BY m", from, to),
    db.all<{ m: string; n: number; v: number }>(`SELECT substr(d, 1, 7) AS m, count(*) AS n, sum(v) AS v FROM (${ORDER_NET}) GROUP BY m`, from, to),
    db.get<{ n: number }>('SELECT count(*) AS n FROM work_orders WHERE opened_at BETWEEN ? AND ?', from, to),
    db.all<PeriodReport['topFilters'][number]>(
      `SELECT f.reference_code_snapshot AS code, f.filter_type_snapshot AS type, sum(f.quantity) AS qty
       FROM oil_change_filters f JOIN oil_changes c ON c.id = f.oil_change_id
       WHERE c.serviced_at BETWEEN ? AND ? GROUP BY f.reference_code_snapshot COLLATE NOCASE ORDER BY qty DESC LIMIT 10`,
      from, to,
    ),
    db.all<PeriodReport['topParts'][number]>(
      `SELECT i.description, i.reference_code AS code, sum(i.quantity) AS qty, sum(round(i.quantity * i.unit_price, 2)) AS value
       FROM work_order_items i JOIN work_orders w ON w.id = i.work_order_id
       WHERE i.kind = 'peca' AND w.status = 'concluida' AND w.closed_at BETWEEN ? AND ?
       GROUP BY coalesce(i.reference_code, i.description) COLLATE NOCASE ORDER BY qty DESC LIMIT 10`,
      from, to,
    ),
    db.all<PeriodReport['topOwners'][number]>(
      `SELECT o.id, o.name, count(*) AS services FROM (
         SELECT tractor_id FROM oil_changes WHERE serviced_at BETWEEN ? AND ?
         UNION ALL SELECT tractor_id FROM maintenance_records WHERE serviced_at BETWEEN ? AND ?
       ) s JOIN tractors t ON t.id = s.tractor_id JOIN owners o ON o.id = t.owner_id
       GROUP BY o.id ORDER BY services DESC LIMIT 10`,
      from, to, from, to,
    ),
  ]);

  const oil = new Map(oilByMonth.map((r) => [r.m, r.n]));
  const other = new Map(otherByMonth.map((r) => [r.m, r.n]));
  const rev = new Map(revenueByMonth.map((r) => [r.m, r.v]));
  const months: string[] = [];
  for (let d = `${from.slice(0, 7)}-01`; d.slice(0, 7) <= to.slice(0, 7); d = addMonths(d, 1)) months.push(d.slice(0, 7));
  const sum = (list: { n: number }[]) => list.reduce((s, r) => s + r.n, 0);

  return {
    oilChanges: sum(oilByMonth),
    otherServices: sum(otherByMonth),
    ordersClosed: sum(revenueByMonth),
    ordersOpened: opened?.n ?? 0,
    revenue: revenueByMonth.reduce((s, r) => s + (r.v ?? 0), 0),
    byMonth: months.slice(-24).map((m) => ({ month: m, oil: oil.get(m) ?? 0, other: other.get(m) ?? 0, revenue: rev.get(m) ?? 0 })),
    topFilters,
    topParts,
    topOwners,
  };
}
