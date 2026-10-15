// Catálogo de filtros: consultas e aplicação da importação no banco.
import { getDb, type Arg } from './db';
import {
  normalizeName, type CatalogApplication, type CatalogBrand, type CatalogModel, type Existing, type ImportPlan, type Origin,
  type VerificationStatus,
} from './catalog-core';

export type BrandRow = CatalogBrand & { origin: Origin; model_count: number };
export type ModelRow = CatalogModel & {
  origin: Origin; brand_name: string; app_count: number; systems: string | null; tractor_count: number;
};
export type ApplicationRow = CatalogApplication & { origin: Origin; is_active: number; updated_at: string };

export async function loadExisting(): Promise<Existing> {
  const db = await getDb();
  const [brands, models, apps] = await Promise.all([
    db.all<CatalogBrand & { origin: Origin }>('SELECT id, name, coverage, origin FROM catalog_brands'),
    db.all<CatalogModel & { origin: Origin }>('SELECT id, brand_id, model, engine_ref, catalog_status, notes, origin FROM catalog_models'),
    db.all<CatalogApplication & { origin: Origin }>(
      `SELECT id, model_id, system, position, filter_brand, filter_code, original_code, version_condition, quantity,
              verification_status, source_url, notes, origin FROM catalog_applications`,
    ),
  ]);
  return {
    brands: new Map(brands.map((b) => [b.id, b])),
    models: new Map(models.map((m) => [m.id, m])),
    applications: new Map(apps.map((a) => [a.id, a])),
  };
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ','now')";

/** Grava o plano numa única operação atômica. Registros da oficina nunca são tocados (cláusula WHERE origin). */
export async function applyImport(plan: ImportPlan, existing: Existing, user: string | null): Promise<void> {
  const stmts: { sql: string; args: Arg[] }[] = [];
  for (const b of [...plan.brands.create, ...plan.brands.update]) {
    stmts.push({
      sql: `INSERT INTO catalog_brands (id, name, coverage) VALUES (?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET name = excluded.name, coverage = excluded.coverage, updated_at = ${NOW}
            WHERE catalog_brands.origin = 'importado'`,
      args: [b.id, b.name, b.coverage],
    });
  }
  for (const m of [...plan.models.create, ...plan.models.update]) {
    stmts.push({
      sql: `INSERT INTO catalog_models (id, brand_id, model, engine_ref, catalog_status, notes) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET brand_id = excluded.brand_id, model = excluded.model, engine_ref = excluded.engine_ref,
              catalog_status = excluded.catalog_status, notes = excluded.notes, updated_at = ${NOW}
            WHERE catalog_models.origin = 'importado'`,
      args: [m.id, m.brand_id, m.model, m.engine_ref, m.catalog_status, m.notes],
    });
  }
  for (const a of plan.applications.update) {
    const old = existing.applications.get(a.id);
    if (old) stmts.push({ sql: 'INSERT INTO catalog_application_history (application_id, snapshot, changed_by) VALUES (?, ?, ?)', args: [a.id, JSON.stringify(old), `importação${user ? ` (${user})` : ''}`] });
  }
  for (const a of [...plan.applications.create, ...plan.applications.update]) {
    stmts.push({
      sql: `INSERT INTO catalog_applications (id, model_id, system, position, filter_brand, filter_code, original_code, version_condition,
              quantity, verification_status, source_url, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET model_id = excluded.model_id, system = excluded.system, position = excluded.position,
              filter_brand = excluded.filter_brand, filter_code = excluded.filter_code, original_code = excluded.original_code,
              version_condition = excluded.version_condition, quantity = excluded.quantity,
              verification_status = excluded.verification_status, source_url = excluded.source_url, notes = excluded.notes,
              updated_at = ${NOW}
            WHERE catalog_applications.origin = 'importado'`,
      args: [a.id, a.model_id, a.system, a.position, a.filter_brand, a.filter_code, a.original_code, a.version_condition,
        a.quantity, a.verification_status, a.source_url, a.notes],
    });
  }
  await (await getDb()).batch(stmts);
}

// ---------- Consultas ----------

export async function listCatalogBrands(): Promise<BrandRow[]> {
  return (await getDb()).all<BrandRow>(
    `SELECT b.*, (SELECT count(*) FROM catalog_models m WHERE m.brand_id = b.id) AS model_count
     FROM catalog_brands b ORDER BY model_count = 0, b.name COLLATE NOCASE`,
  );
}

export async function listCatalogModels(opts: { q?: string; brandId?: string; system?: string } = {}): Promise<ModelRow[]> {
  const where: string[] = [];
  const params: Arg[] = [];
  if (opts.brandId) { where.push('m.brand_id = ?'); params.push(opts.brandId); }
  if (opts.system) {
    where.push('EXISTS (SELECT 1 FROM catalog_applications a WHERE a.model_id = m.id AND a.is_active = 1 AND a.system = ?)');
    params.push(opts.system);
  }
  const q = opts.q?.trim();
  if (q) {
    // "John Deere 5075E", "5075e", "jd 5075" ou código de filtro.
    const like = `%${q}%`;
    const compact = `%${normalizeName(q)}%`;
    where.push(`(m.model LIKE ? OR b.name LIKE ? OR (b.name || ' ' || m.model) LIKE ?
      OR replace(replace(replace(lower(b.name || m.model), ' ', ''), '-', ''), '/', '') LIKE ?
      OR EXISTS (SELECT 1 FROM catalog_applications a WHERE a.model_id = m.id AND a.is_active = 1
                 AND (a.filter_code LIKE ? OR replace(lower(a.filter_code), ' ', '') LIKE ?)))`);
    params.push(like, like, like, compact, like, compact);
  }
  return (await getDb()).all<ModelRow>(
    `SELECT m.*, b.name AS brand_name,
       (SELECT count(*) FROM catalog_applications a WHERE a.model_id = m.id AND a.is_active = 1) AS app_count,
       (SELECT group_concat(DISTINCT a.system) FROM catalog_applications a WHERE a.model_id = m.id AND a.is_active = 1) AS systems,
       (SELECT count(*) FROM tractors t WHERE t.catalog_model_id = m.id) AS tractor_count
     FROM catalog_models m JOIN catalog_brands b ON b.id = m.brand_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY b.name COLLATE NOCASE, m.model COLLATE NOCASE`,
    ...params,
  );
}

export async function listCatalogSystems(): Promise<string[]> {
  const rows = await (await getDb()).all<{ system: string }>('SELECT DISTINCT system FROM catalog_applications WHERE is_active = 1 ORDER BY system');
  return rows.map((r) => r.system);
}

export async function getCatalogModel(id: string): Promise<(ModelRow & { coverage: string | null }) | null> {
  const row = await (await getDb()).get<ModelRow & { coverage: string | null }>(
    `SELECT m.*, b.name AS brand_name, b.coverage,
       (SELECT count(*) FROM catalog_applications a WHERE a.model_id = m.id AND a.is_active = 1) AS app_count,
       NULL AS systems,
       (SELECT count(*) FROM tractors t WHERE t.catalog_model_id = m.id) AS tractor_count
     FROM catalog_models m JOIN catalog_brands b ON b.id = m.brand_id WHERE m.id = ?`,
    id,
  );
  return row ?? null;
}

export async function listApplications(modelId: string, opts: { includeInactive?: boolean; system?: string } = {}): Promise<ApplicationRow[]> {
  const where = ['model_id = ?'];
  const params: Arg[] = [modelId];
  if (!opts.includeInactive) where.push('is_active = 1');
  if (opts.system) { where.push('system = ?'); params.push(opts.system); }
  return (await getDb()).all<ApplicationRow>(
    `SELECT * FROM catalog_applications WHERE ${where.join(' AND ')} ORDER BY system, position, id`,
    ...params,
  );
}

export async function getApplication(id: string): Promise<ApplicationRow | null> {
  return (await (await getDb()).get<ApplicationRow>('SELECT * FROM catalog_applications WHERE id = ?', id)) ?? null;
}

export async function getApplicationHistory(id: string) {
  return (await getDb()).all<{ id: number; snapshot: string; changed_by: string | null; changed_at: string }>(
    'SELECT * FROM catalog_application_history WHERE application_id = ? ORDER BY id DESC', id,
  );
}

export async function tractorsUsingModel(modelId: string) {
  return (await getDb()).all<{ id: number; sequential_number: number; owner_name: string }>(
    `SELECT t.id, t.sequential_number, o.name AS owner_name FROM tractors t JOIN owners o ON o.id = t.owner_id
     WHERE t.catalog_model_id = ? ORDER BY t.sequential_number`,
    modelId,
  );
}

/** Sugere o modelo do catálogo pela marca/modelo digitados no trator (ignora acentos, espaços e hífens). */
export async function suggestCatalogModel(brand: string, model: string): Promise<{ id: string; label: string }[]> {
  const rows = await (await getDb()).all<{ id: string; model: string; brand_name: string }>(
    'SELECT m.id, m.model, b.name AS brand_name FROM catalog_models m JOIN catalog_brands b ON b.id = m.brand_id',
  );
  const nm = normalizeName(model);
  const nb = normalizeName(brand);
  return rows
    .filter((r) => nm && normalizeName(r.model) === nm && (!nb || normalizeName(r.brand_name).includes(nb) || nb.includes(normalizeName(r.brand_name).slice(0, 4))))
    .map((r) => ({ id: r.id, label: `${r.brand_name} ${r.model}` }));
}

export async function listModelOptions() {
  return (await getDb()).all<{ id: string; label: string }>(
    `SELECT m.id, b.name || ' ' || m.model AS label FROM catalog_models m JOIN catalog_brands b ON b.id = m.brand_id
     ORDER BY b.name COLLATE NOCASE, m.model COLLATE NOCASE`,
  );
}

// ---------- Confirmações por trator ----------

export type ConfirmationStatus = 'confirmado' | 'descartado' | 'candidato';

export interface Confirmation {
  id: number;
  tractor_id: number;
  application_id: string | null;
  status: ConfirmationStatus;
  system: string;
  filter_brand: string | null;
  filter_code: string;
  version_condition: string | null;
  notes: string | null;
  confirmed_on: string;
  responsible: string | null;
  created_at: string;
}

export type TractorCandidate = ApplicationRow & { state: ConfirmationStatus; last: Confirmation | null };

/** Aplicações do modelo vinculado ao trator + situação para ESTE trator (última confirmação/descarte). */
export async function tractorCandidates(tractorId: number, modelId: string | null): Promise<TractorCandidate[]> {
  if (!modelId) return [];
  const db = await getDb();
  const [apps, confirmations] = await Promise.all([
    listApplications(modelId),
    db.all<Confirmation>(
      'SELECT * FROM tractor_filter_confirmations WHERE tractor_id = ? AND application_id IS NOT NULL ORDER BY id DESC', tractorId,
    ),
  ]);
  const latest = new Map<string, Confirmation>();
  for (const c of confirmations) if (!latest.has(c.application_id!)) latest.set(c.application_id!, c);
  return apps.map((a) => {
    const last = latest.get(a.id) ?? null;
    return { ...a, state: last?.status ?? 'candidato', last };
  });
}

export async function confirmationHistory(tractorId: number): Promise<Confirmation[]> {
  return (await getDb()).all<Confirmation>('SELECT * FROM tractor_filter_confirmations WHERE tractor_id = ? ORDER BY id DESC LIMIT 100', tractorId);
}

export const STATUS_OPTIONS: VerificationStatus[] = ['catalogo_aplicacao_geral', 'pendente', 'verificado_oficina'];
