// Outras manutenções: tipos, planos por trator (intervalos próprios) e registros.
import { getDb } from './db';
import { getSettings } from './settings';
import { compareUrgency, computeStatus, todayInTimeZone, type StatusResult } from './status';

export interface MaintenanceType { id: number; name: string; is_active: number; plan_count: number }

export function listMaintenanceTypes(includeInactive = false): MaintenanceType[] {
  return getDb()
    .prepare(
      `SELECT mt.*, (SELECT count(*) FROM maintenance_plans p WHERE p.type_id = mt.id) AS plan_count
       FROM maintenance_types mt ${includeInactive ? '' : 'WHERE mt.is_active = 1'} ORDER BY mt.name COLLATE NOCASE`,
    )
    .all() as unknown as MaintenanceType[];
}

export interface Plan {
  id: number;
  tractor_id: number;
  type_id: number;
  type_name: string;
  interval_hours: number | null;
  interval_months: number | null;
  spec: string | null;
  notes: string | null;
  sequential_number: number;
  brand: string;
  model: string;
  owner_name: string;
  current_hours: number | null;
  hours_read_at: string | null;
  last_date: string | null;
  last_hours: number | null;
  st: StatusResult;
}

export function listPlans(opts: { tractorId?: number; activeOnly?: boolean } = {}): Plan[] {
  const where: string[] = [];
  const params: number[] = [];
  if (opts.tractorId) { where.push('p.tractor_id = ?'); params.push(opts.tractorId); }
  if (opts.activeOnly) where.push('t.is_active = 1');
  const rows = getDb()
    .prepare(
      `SELECT p.*, mt.name AS type_name, t.sequential_number, t.brand, t.model, o.name AS owner_name,
              t.current_hours, t.hours_read_at, r.serviced_at AS last_date, r.service_hours AS last_hours
       FROM maintenance_plans p
       JOIN maintenance_types mt ON mt.id = p.type_id
       JOIN tractors t ON t.id = p.tractor_id
       JOIN owners o ON o.id = t.owner_id
       LEFT JOIN maintenance_records r ON r.id = (
         SELECT id FROM maintenance_records WHERE tractor_id = p.tractor_id AND type_id = p.type_id
         ORDER BY serviced_at DESC, service_hours DESC, id DESC LIMIT 1)
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY t.sequential_number, mt.name`,
    )
    .all(...params) as unknown as Omit<Plan, 'st'>[];
  const today = todayInTimeZone();
  const { thresholds } = getSettings();
  return rows.map((p) => ({
    ...p,
    st: computeStatus({
      intervalHours: p.interval_hours,
      intervalMonths: p.interval_months,
      // Registro sem horímetro só serve para o critério de meses.
      lastChange: p.last_date ? { date: p.last_date, hours: p.last_hours ?? Number.NaN } : null,
      currentHours: p.last_date && p.last_hours == null && p.interval_hours ? null : p.current_hours,
      lastLabel: 'último serviço registrado',
      hoursReadAt: p.hours_read_at,
      today,
      thresholds,
    }),
  }));
}

/** Planos que pedem atenção (vencidos/próximos), ordenados por urgência. */
export function planAlerts(): Plan[] {
  return listPlans({ activeOnly: true })
    .filter((p) => p.st.status === 'vencida' || p.st.status === 'proxima')
    .sort((a, b) => compareUrgency(a.st, b.st));
}

export interface MaintenanceRecord {
  id: number;
  tractor_id: number;
  type_id: number;
  type_name: string;
  serviced_at: string;
  service_hours: number | null;
  product_used: string | null;
  quantity: number | null;
  notes: string | null;
  performed_by: string | null;
  work_order_id: number | null;
  sequential_number: number;
  brand: string;
  model: string;
  owner_id: number;
  owner_name: string;
}

export function listRecords(opts: { tractorId?: number; q?: string; typeId?: number; limit?: number } = {}): MaintenanceRecord[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.tractorId) { where.push('r.tractor_id = ?'); params.push(opts.tractorId); }
  if (opts.typeId) { where.push('r.type_id = ?'); params.push(opts.typeId); }
  const q = opts.q?.trim();
  if (q) {
    if (/^\d+$/.test(q)) { where.push('t.sequential_number = ?'); params.push(Number(q)); }
    else {
      where.push("(o.name LIKE ? OR t.brand LIKE ? OR t.model LIKE ? OR mt.name LIKE ? OR r.product_used LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
  }
  return getDb()
    .prepare(
      `SELECT r.*, mt.name AS type_name, t.sequential_number, t.brand, t.model, t.owner_id, o.name AS owner_name
       FROM maintenance_records r
       JOIN maintenance_types mt ON mt.id = r.type_id
       JOIN tractors t ON t.id = r.tractor_id
       JOIN owners o ON o.id = t.owner_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY r.serviced_at DESC, r.id DESC LIMIT ${Math.min(opts.limit ?? 200, 500)}`,
    )
    .all(...params) as unknown as MaintenanceRecord[];
}
