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

export async function listModels(q = ''): Promise<TractorModel[]> {
  const like = `%${q.trim()}%`;
  return (await getDb()).all<TractorModel>(
    `SELECT m.*,
       (SELECT count(*) FROM tractor_model_filters f WHERE f.model_id = m.id) AS filter_count,
       (SELECT count(*) FROM tractors t WHERE t.brand = m.brand COLLATE NOCASE AND t.model = m.model COLLATE NOCASE) AS tractor_count
     FROM tractor_models m WHERE (m.brand || ' ' || m.model) LIKE ?
     ORDER BY m.brand COLLATE NOCASE, m.model COLLATE NOCASE`,
    like,
  );
}

export async function getModel(id: number): Promise<(TractorModel & { filters: ModelFilter[] }) | null> {
  const db = await getDb();
  const [m, filters] = await Promise.all([
    db.get<TractorModel>('SELECT m.*, 0 AS filter_count, 0 AS tractor_count FROM tractor_models m WHERE m.id = ?', id),
    db.all<ModelFilter>('SELECT * FROM tractor_model_filters WHERE model_id = ? ORDER BY id', id),
  ]);
  return m ? { ...m, filters } : null;
}
