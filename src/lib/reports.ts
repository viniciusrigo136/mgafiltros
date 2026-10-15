// Indicadores por período para a tela Relatórios.
import { getDb } from './db';

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

export function periodReport(from: string, to: string): PeriodReport {
  const db = getDb();
  const one = <T>(sql: string, ...p: (string | number)[]) => db.prepare(sql).get(...p) as T;
  const revenueSql = `
    SELECT coalesce(sum(t), 0) AS v FROM (
      SELECT max(0, coalesce((SELECT sum(round(i.quantity * i.unit_price, 2)) FROM work_order_items i WHERE i.work_order_id = w.id), 0) - w.discount) AS t
      FROM work_orders w WHERE w.status = 'concluida' AND w.closed_at BETWEEN ? AND ?)`;

  const months = db
    .prepare(
      `WITH RECURSIVE m(d) AS (SELECT date(?, 'start of month') UNION ALL SELECT date(d, '+1 month') FROM m WHERE d < date(?, 'start of month'))
       SELECT strftime('%Y-%m', d) AS month FROM m`,
    )
    .all(from, to) as { month: string }[];

  const byMonth = months.slice(-24).map(({ month }) => {
    const start = `${month}-01`;
    const end = db.prepare(`SELECT date(?, '+1 month', '-1 day') AS e`).get(start) as { e: string };
    const a = start < from ? from : start;
    const b = end.e > to ? to : end.e;
    return {
      month,
      oil: one<{ n: number }>('SELECT count(*) AS n FROM oil_changes WHERE serviced_at BETWEEN ? AND ?', a, b).n,
      other: one<{ n: number }>('SELECT count(*) AS n FROM maintenance_records WHERE serviced_at BETWEEN ? AND ?', a, b).n,
      revenue: one<{ v: number }>(revenueSql, a, b).v,
    };
  });

  return {
    oilChanges: one<{ n: number }>('SELECT count(*) AS n FROM oil_changes WHERE serviced_at BETWEEN ? AND ?', from, to).n,
    otherServices: one<{ n: number }>('SELECT count(*) AS n FROM maintenance_records WHERE serviced_at BETWEEN ? AND ?', from, to).n,
    ordersClosed: one<{ n: number }>("SELECT count(*) AS n FROM work_orders WHERE status = 'concluida' AND closed_at BETWEEN ? AND ?", from, to).n,
    ordersOpened: one<{ n: number }>('SELECT count(*) AS n FROM work_orders WHERE opened_at BETWEEN ? AND ?', from, to).n,
    revenue: one<{ v: number }>(revenueSql, from, to).v,
    byMonth,
    topFilters: db
      .prepare(
        `SELECT f.reference_code_snapshot AS code, f.filter_type_snapshot AS type, sum(f.quantity) AS qty
         FROM oil_change_filters f JOIN oil_changes c ON c.id = f.oil_change_id
         WHERE c.serviced_at BETWEEN ? AND ? GROUP BY f.reference_code_snapshot COLLATE NOCASE ORDER BY qty DESC LIMIT 10`,
      )
      .all(from, to) as PeriodReport['topFilters'],
    topParts: db
      .prepare(
        `SELECT i.description, i.reference_code AS code, sum(i.quantity) AS qty, sum(round(i.quantity * i.unit_price, 2)) AS value
         FROM work_order_items i JOIN work_orders w ON w.id = i.work_order_id
         WHERE i.kind = 'peca' AND w.status = 'concluida' AND w.closed_at BETWEEN ? AND ?
         GROUP BY coalesce(i.reference_code, i.description) COLLATE NOCASE ORDER BY qty DESC LIMIT 10`,
      )
      .all(from, to) as PeriodReport['topParts'],
    topOwners: db
      .prepare(
        `SELECT o.id, o.name, count(*) AS services FROM (
           SELECT tractor_id FROM oil_changes WHERE serviced_at BETWEEN ? AND ?
           UNION ALL SELECT tractor_id FROM maintenance_records WHERE serviced_at BETWEEN ? AND ?
         ) s JOIN tractors t ON t.id = s.tractor_id JOIN owners o ON o.id = t.owner_id
         GROUP BY o.id ORDER BY services DESC LIMIT 10`,
      )
      .all(from, to, from, to) as PeriodReport['topOwners'],
  };
}
