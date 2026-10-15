// Consultas de leitura. Situação da manutenção é sempre calculada a partir dos dados reais.
import { getDb } from './db';
import {
  addDays, compareUrgency, computeStatus, estimateHoursDueDate, todayInTimeZone, usageRate,
  type MaintenanceStatus, type StatusResult, type Thresholds,
} from './status';
import { getSettings } from './settings';

export interface Owner {
  id: number;
  name: string;
  phone: string | null;
  city: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  tractor_count: number;
}

export interface Tractor {
  id: number;
  sequential_number: number;
  owner_id: number;
  owner_name: string;
  owner_phone: string | null;
  owner_active: number;
  brand: string;
  model: string;
  year: number | null;
  serial_number: string | null;
  current_hours: number | null;
  hours_read_at: string | null;
  oil_spec: string | null;
  oil_capacity_liters: number | null;
  interval_hours: number | null;
  interval_months: number | null;
  notes: string | null;
  is_active: number;
  last_change_date: string | null;
  last_change_hours: number | null;
}

export type TractorWithStatus = Tractor & {
  st: StatusResult;
  /** Uso médio (h/dia) calculado pelas leituras; null sem base suficiente. */
  usageRate: number | null;
  /** Data estimada em que o limite de horas será atingido, pelo uso médio. */
  estimatedHoursDate: string | null;
};

export interface TractorFilter {
  id: number;
  tractor_id: number;
  filter_type: string;
  reference_code: string;
  manufacturer: string | null;
  quantity: number;
  notes: string | null;
}

export interface OilChange {
  id: number;
  tractor_id: number;
  sequential_number: number;
  brand: string;
  model: string;
  owner_id: number;
  owner_name: string;
  serviced_at: string;
  service_hours: number;
  oil_used: string | null;
  liters_used: number | null;
  notes: string | null;
  performed_by: string | null;
  is_initial: number;
  created_by_name: string | null;
  filters: { filter_type_snapshot: string; reference_code_snapshot: string; manufacturer_snapshot: string | null; quantity: number }[];
}

export interface HourReading {
  id: number;
  hours: number;
  read_at: string;
  is_correction: number;
  reason: string | null;
  created_at: string;
}

const TRACTOR_SELECT = `
  SELECT t.*, o.name AS owner_name, o.phone AS owner_phone, o.is_active AS owner_active,
         lc.serviced_at AS last_change_date, lc.service_hours AS last_change_hours
  FROM tractors t
  JOIN owners o ON o.id = t.owner_id
  LEFT JOIN oil_changes lc ON lc.id = (
    SELECT id FROM oil_changes WHERE tractor_id = t.id
    ORDER BY serviced_at DESC, service_hours DESC, id DESC LIMIT 1
  )`;

interface StatusContext { today: string; thresholds: Thresholds; readings: Map<number, ReadingPoint[]> }
type ReadingPoint = { hours: number; read_at: string; is_correction: number };

/** Leituras do último ano por trator, descartando as anteriores à última correção (troca de horímetro). */
function loadReadings(today: string, tractorId?: number): Map<number, ReadingPoint[]> {
  const rows = getDb()
    .prepare(
      `SELECT tractor_id, hours, read_at, is_correction FROM hour_readings
       WHERE read_at >= ? ${tractorId ? 'AND tractor_id = ?' : ''} ORDER BY tractor_id, read_at, id`,
    )
    .all(...(tractorId ? [addDays(today, -365), tractorId] : [addDays(today, -365)])) as (ReadingPoint & { tractor_id: number })[];
  const map = new Map<number, ReadingPoint[]>();
  for (const r of rows) {
    let list = map.get(r.tractor_id);
    if (!list) map.set(r.tractor_id, (list = []));
    if (r.is_correction) list.length = 0;
    list.push(r);
  }
  return map;
}

function statusContext(tractorId?: number): StatusContext {
  const today = todayInTimeZone();
  return { today, thresholds: getSettings().thresholds, readings: loadReadings(today, tractorId) };
}

export function withStatus(t: Tractor, ctx: StatusContext): TractorWithStatus {
  const st = computeStatus({
    intervalHours: t.interval_hours,
    intervalMonths: t.interval_months,
    lastChange: t.last_change_date != null ? { date: t.last_change_date, hours: t.last_change_hours! } : null,
    currentHours: t.current_hours,
    hoursReadAt: t.hours_read_at,
    today: ctx.today,
    thresholds: ctx.thresholds,
  });
  const rate = usageRate(ctx.readings.get(t.id) ?? [], ctx.today);
  return { ...t, st, usageRate: rate, estimatedHoursDate: estimateHoursDueDate(st.hoursRemaining, rate, t.hours_read_at) };
}

function likeParam(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function listOwners(opts: { q?: string; includeInactive?: boolean } = {}): Owner[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (!opts.includeInactive) where.push('o.is_active = 1');
  if (opts.q) {
    const digits = opts.q.replace(/\D/g, '');
    where.push(`(o.name LIKE ? ESCAPE '\\' OR o.city LIKE ? ESCAPE '\\'${digits.length >= 4 ? ' OR o.phone LIKE ?' : ''})`);
    params.push(likeParam(opts.q), likeParam(opts.q));
    if (digits.length >= 4) params.push(`%${digits}%`);
  }
  return getDb()
    .prepare(
      `SELECT o.*, (SELECT count(*) FROM tractors t WHERE t.owner_id = o.id AND t.is_active = 1) AS tractor_count
       FROM owners o ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY o.is_active DESC, o.name COLLATE NOCASE`,
    )
    .all(...params) as unknown as Owner[];
}

export function getOwner(id: number): Owner | null {
  return (getDb()
    .prepare(`SELECT o.*, (SELECT count(*) FROM tractors t WHERE t.owner_id = o.id) AS tractor_count FROM owners o WHERE o.id = ?`)
    .get(id) as unknown as Owner | undefined) ?? null;
}

export function listTractors(
  opts: { q?: string; status?: MaintenanceStatus | ''; ownerId?: number; includeInactive?: boolean } = {},
): TractorWithStatus[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (!opts.includeInactive) where.push('t.is_active = 1');
  if (opts.ownerId) {
    where.push('t.owner_id = ?');
    params.push(opts.ownerId);
  }
  const q = opts.q?.trim();
  if (q) {
    const like = likeParam(q);
    const parts = [
      "o.name LIKE ? ESCAPE '\\'", "t.brand LIKE ? ESCAPE '\\'", "t.model LIKE ? ESCAPE '\\'",
      "(t.brand || ' ' || t.model) LIKE ? ESCAPE '\\'", "t.serial_number LIKE ? ESCAPE '\\'",
      "EXISTS (SELECT 1 FROM tractor_filters f WHERE f.tractor_id = t.id AND f.reference_code LIKE ? ESCAPE '\\')",
    ];
    params.push(like, like, like, like, like, like);
    if (/^\d+$/.test(q)) {
      parts.unshift('t.sequential_number = ?');
      params.splice(params.length - 6, 0, Number(q));
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  const rows = getDb()
    .prepare(`${TRACTOR_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.sequential_number`)
    .all(...params) as unknown as Tractor[];
  const ctx = statusContext();
  let list = rows.map((t) => withStatus(t, ctx));
  if (opts.status) list = list.filter((t) => t.st.status === opts.status);
  return list;
}

export function sortByUrgency(list: TractorWithStatus[]): TractorWithStatus[] {
  return [...list].sort((a, b) => compareUrgency(a.st, b.st) || a.sequential_number - b.sequential_number);
}

export function getTractor(id: number): TractorWithStatus | null {
  const t = getDb().prepare(`${TRACTOR_SELECT} WHERE t.id = ?`).get(id) as unknown as Tractor | undefined;
  return t ? withStatus(t, statusContext(id)) : null;
}

export function findTractorIdByNumber(n: number): number | null {
  const row = getDb().prepare('SELECT id FROM tractors WHERE sequential_number = ?').get(n) as { id: number } | undefined;
  return row?.id ?? null;
}

export function getTractorFilters(tractorId: number): TractorFilter[] {
  return getDb()
    .prepare('SELECT * FROM tractor_filters WHERE tractor_id = ? ORDER BY id')
    .all(tractorId) as unknown as TractorFilter[];
}

export function listOilChanges(opts: { tractorId?: number; ownerId?: number; q?: string; limit?: number } = {}): OilChange[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.tractorId) { where.push('c.tractor_id = ?'); params.push(opts.tractorId); }
  if (opts.ownerId) { where.push('t.owner_id = ?'); params.push(opts.ownerId); }
  const q = opts.q?.trim();
  if (q) {
    if (/^\d+$/.test(q)) {
      where.push('t.sequential_number = ?');
      params.push(Number(q));
    } else {
      const like = likeParam(q);
      where.push("(o.name LIKE ? ESCAPE '\\' OR t.brand LIKE ? ESCAPE '\\' OR t.model LIKE ? ESCAPE '\\' OR c.oil_used LIKE ? ESCAPE '\\')");
      params.push(like, like, like, like);
    }
  }
  const db = getDb();
  const changes = db
    .prepare(
      `SELECT c.*, t.sequential_number, t.brand, t.model, t.owner_id, o.name AS owner_name, u.name AS created_by_name
       FROM oil_changes c
       JOIN tractors t ON t.id = c.tractor_id
       JOIN owners o ON o.id = t.owner_id
       LEFT JOIN users u ON u.id = c.created_by
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY c.serviced_at DESC, c.service_hours DESC, c.id DESC
       LIMIT ${Math.min(opts.limit ?? 200, 500)}`,
    )
    .all(...params) as unknown as OilChange[];
  if (!changes.length) return changes;
  const filters = db
    .prepare(`SELECT * FROM oil_change_filters WHERE oil_change_id IN (${changes.map(() => '?').join(',')}) ORDER BY id`)
    .all(...changes.map((c) => c.id)) as unknown as (OilChange['filters'][number] & { oil_change_id: number })[];
  for (const c of changes) c.filters = filters.filter((f) => f.oil_change_id === c.id);
  return changes;
}

export function listHourReadings(tractorId: number, limit = 10): HourReading[] {
  return getDb()
    .prepare('SELECT * FROM hour_readings WHERE tractor_id = ? ORDER BY read_at DESC, id DESC LIMIT ?')
    .all(tractorId, limit) as unknown as HourReading[];
}

export function dashboard() {
  const all = listTractors();
  const counts: Record<MaintenanceStatus, number> = { vencida: 0, proxima: 0, em_dia: 0, sem_dados: 0 };
  for (const t of all) counts[t.st.status]++;
  const attention = sortByUrgency(all.filter((t) => t.st.status !== 'em_dia'));
  return { counts, attention, total: all.length, upcoming: upcomingChanges(all) };
}

/** Próximas trocas previstas (ainda não vencidas), pela data mais cedo entre o uso médio e o prazo em meses. */
export function upcomingChanges(list: TractorWithStatus[]) {
  const out: { t: TractorWithStatus; date: string; basis: string }[] = [];
  for (const t of list) {
    if (t.st.status === 'vencida' || t.st.status === 'sem_dados') continue;
    const byHours = t.estimatedHoursDate;
    const byDate = t.st.nextDate;
    if (!byHours && !byDate) continue;
    const useHours = byHours != null && (byDate == null || byHours <= byDate);
    out.push({
      t,
      date: useHours ? byHours! : byDate!,
      basis: useHours ? `uso médio de ${t.usageRate!.toFixed(1).replace('.', ',')} h/dia` : 'prazo em meses',
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function listOwnerOptions() {
  return getDb()
    .prepare('SELECT id, name FROM owners WHERE is_active = 1 ORDER BY name COLLATE NOCASE')
    .all() as { id: number; name: string }[];
}

export function listTractorOptions() {
  return getDb()
    .prepare(
      `SELECT t.id, t.sequential_number, t.brand, t.model, o.name AS owner_name
       FROM tractors t JOIN owners o ON o.id = t.owner_id WHERE t.is_active = 1 ORDER BY t.sequential_number`,
    )
    .all() as { id: number; sequential_number: number; brand: string; model: string; owner_name: string }[];
}
