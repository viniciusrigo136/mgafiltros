// Modelos de trator (templates de óleo, intervalos e filtros revisados pela oficina).
import { getDb } from './db';

export interface TractorModel {
  id: number;
  brand: string;
  model: string;
  oil_spec: string | null;
  oil_capacity_liters: number | null;
  interval_hours: number | null;
  interval_months: number | null;
  notes: string | null;
  filter_count: number;
  tractor_count: number;
}

export interface ModelFilter { id: number; filter_type: string; reference_code: string; manufacturer: string | null; quantity: number; notes: string | null }

export function listModels(q = ''): TractorModel[] {
  const like = `%${q.trim()}%`;
  return getDb()
    .prepare(
      `SELECT m.*,
         (SELECT count(*) FROM tractor_model_filters f WHERE f.model_id = m.id) AS filter_count,
         (SELECT count(*) FROM tractors t WHERE t.brand = m.brand COLLATE NOCASE AND t.model = m.model COLLATE NOCASE) AS tractor_count
       FROM tractor_models m WHERE (m.brand || ' ' || m.model) LIKE ?
       ORDER BY m.brand COLLATE NOCASE, m.model COLLATE NOCASE`,
    )
    .all(like) as unknown as TractorModel[];
}

export function getModel(id: number): (TractorModel & { filters: ModelFilter[] }) | null {
  const db = getDb();
  const m = db.prepare('SELECT m.*, 0 AS filter_count, 0 AS tractor_count FROM tractor_models m WHERE m.id = ?').get(id) as unknown as TractorModel | undefined;
  if (!m) return null;
  const filters = db.prepare('SELECT * FROM tractor_model_filters WHERE model_id = ? ORDER BY id').all(id) as unknown as ModelFilter[];
  return { ...m, filters };
}
