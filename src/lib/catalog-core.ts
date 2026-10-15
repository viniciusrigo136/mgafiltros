// Catálogo de filtros: leitura (JSON/CSV), validação, plano de importação idempotente e agrupamento.
// Módulo puro (sem banco) para ser testável.
import { parseCsv } from './csv.ts';
import type { FilterType } from './format.ts';

export const CATALOG_ALERT = 'Confirme ano, motor e número de série antes de comprar/instalar.';

export const VERIFICATION_STATUSES = ['catalogo_aplicacao_geral', 'pendente', 'verificado_oficina'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  catalogo_aplicacao_geral: 'Catálogo (aplicação geral)',
  pendente: 'Pendente de verificação',
  verificado_oficina: 'Verificado pela oficina',
};

export interface CatalogBrand { id: string; name: string; coverage: string | null }
export interface CatalogModel {
  id: string; brand_id: string; model: string; engine_ref: string | null; catalog_status: string | null; notes: string | null;
}
export interface CatalogApplication {
  id: string; model_id: string; system: string; position: string | null; filter_brand: string | null; filter_code: string;
  original_code: string | null; version_condition: string | null; quantity: number | null;
  verification_status: VerificationStatus; source_url: string | null; notes: string | null;
}
export interface CatalogPayload { brands: CatalogBrand[]; models: CatalogModel[]; applications: CatalogApplication[] }

export interface RowError { where: string; message: string }

// ---------- Normalização ----------

/** Texto: remove só espaços nas pontas (códigos como "C 17 337/3" ficam intactos). Vazio → null. */
function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function qty(v: unknown): number | null | 'invalid' {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isInteger(n) && n > 0 && n < 1000 ? n : 'invalid';
}

const ID_RE = /^[\w.-]{1,100}$/;

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// ---------- Leitura ----------

type Raw = Record<string, unknown>;

function fromRaw(raw: { marcas?: Raw[]; modelos?: Raw[]; aplicacoes_filtros?: Raw[] }): { payload: CatalogPayload; errors: RowError[] } {
  const errors: RowError[] = [];
  const brands: CatalogBrand[] = [];
  const models: CatalogModel[] = [];
  const applications: CatalogApplication[] = [];

  (raw.marcas ?? []).forEach((r, i) => {
    const id = str(r.id);
    const name = str(r.nome);
    if (!id || !ID_RE.test(id) || !name) { errors.push({ where: `marca ${i + 1}`, message: 'id ou nome inválido' }); return; }
    brands.push({ id, name, coverage: str(r.cobertura) });
  });
  (raw.modelos ?? []).forEach((r, i) => {
    const id = str(r.id);
    const brandId = str(r.brand_id);
    const model = str(r.modelo);
    if (!id || !ID_RE.test(id) || !brandId || !model) { errors.push({ where: `modelo ${id ?? i + 1}`, message: 'id, brand_id ou modelo inválido' }); return; }
    models.push({ id, brand_id: brandId, model, engine_ref: str(r.motor_referencia), catalog_status: str(r.status_catalogo), notes: str(r.observacao) });
  });
  (raw.aplicacoes_filtros ?? []).forEach((r, i) => {
    const id = str(r.id);
    const where = `aplicação ${id ?? i + 1}`;
    const modelId = str(r.modelo_id);
    const system = str(r.tipo_filtro);
    const code = str(r.codigo_filtro);
    const q = qty(r.quantidade);
    const status = (str(r.status_verificacao) ?? 'catalogo_aplicacao_geral') as VerificationStatus;
    const problems: string[] = [];
    if (!id || !ID_RE.test(id)) problems.push('id inválido');
    if (!modelId) problems.push('modelo_id vazio');
    if (!system) problems.push('tipo_filtro vazio');
    if (!code) problems.push('codigo_filtro vazio');
    if (q === 'invalid') problems.push('quantidade inválida');
    if (!VERIFICATION_STATUSES.includes(status)) problems.push(`status_verificacao "${status}" não aceito no catálogo geral`);
    const url = str(r.fonte_url);
    if (url && !/^https?:\/\//i.test(url)) problems.push('fonte_url deve começar com http(s)://');
    if (problems.length) { errors.push({ where, message: problems.join(', ') }); return; }
    applications.push({
      id: id!, model_id: modelId!, system: system!, position: str(r.posicao), filter_brand: str(r.marca_filtro), filter_code: code!,
      original_code: str(r.codigo_original_referencia), version_condition: str(r.condicao_versao), quantity: q as number | null,
      verification_status: status, source_url: url, notes: str(r.observacoes),
    });
  });
  return { payload: { brands, models, applications }, errors };
}

export function parseCatalogJson(text: string): { payload: CatalogPayload; errors: RowError[] } {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { payload: { brands: [], models: [], applications: [] }, errors: [{ where: 'arquivo', message: 'JSON inválido' }] };
  }
  if (!data || typeof data !== 'object') return { payload: { brands: [], models: [], applications: [] }, errors: [{ where: 'arquivo', message: 'formato inesperado' }] };
  const d = data as { marcas?: Raw[]; modelos?: Raw[]; aplicacoes_filtros?: Raw[] };
  for (const k of ['marcas', 'modelos', 'aplicacoes_filtros'] as const) {
    if (d[k] != null && !Array.isArray(d[k])) return { payload: { brands: [], models: [], applications: [] }, errors: [{ where: 'arquivo', message: `"${k}" deve ser uma lista` }] };
  }
  return fromRaw(d);
}

/** CSVs (marcas, modelos, aplicações), em qualquer combinação; o tipo é detectado pelo cabeçalho. */
export function parseCatalogCsv(files: { name: string; text: string }[]): { payload: CatalogPayload; errors: RowError[] } {
  const raw: { marcas: Raw[]; modelos: Raw[]; aplicacoes_filtros: Raw[] } = { marcas: [], modelos: [], aplicacoes_filtros: [] };
  const errors: RowError[] = [];
  for (const f of files) {
    const rows = parseCsv(f.text);
    if (rows.length < 2) continue;
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const objects = rows.slice(1).map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])));
    if (header.includes('codigo_filtro')) raw.aplicacoes_filtros.push(...objects);
    else if (header.includes('brand_id')) raw.modelos.push(...objects);
    else if (header.includes('nome')) raw.marcas.push(...objects);
    else errors.push({ where: f.name, message: 'cabeçalho não reconhecido (esperado marcas, modelos ou aplicações)' });
  }
  const result = fromRaw(raw);
  return { payload: result.payload, errors: [...errors, ...result.errors] };
}

// ---------- Plano de importação ----------

export type Origin = 'importado' | 'oficina';
export interface Existing {
  brands: Map<string, CatalogBrand & { origin: Origin }>;
  models: Map<string, CatalogModel & { origin: Origin }>;
  applications: Map<string, CatalogApplication & { origin: Origin }>;
}

export interface Bucket<T> { create: T[]; update: T[]; unchanged: number; ignored: T[] }
export interface ImportPlan {
  brands: Bucket<CatalogBrand>;
  models: Bucket<CatalogModel>;
  applications: Bucket<CatalogApplication>;
  errors: RowError[];
}

const BRAND_FIELDS = ['name', 'coverage'] as const;
const MODEL_FIELDS = ['brand_id', 'model', 'engine_ref', 'catalog_status', 'notes'] as const;
const APP_FIELDS = ['model_id', 'system', 'position', 'filter_brand', 'filter_code', 'original_code', 'version_condition', 'quantity',
  'verification_status', 'source_url', 'notes'] as const;

function sameFields<T>(a: T, b: T, fields: readonly (keyof T)[]): boolean {
  return fields.every((f) => (a[f] ?? null) === (b[f] ?? null));
}

function bucket<T extends { id: string }>(
  items: T[], existing: Map<string, T & { origin: Origin }>, fields: readonly (keyof T)[],
): Bucket<T> {
  const b: Bucket<T> = { create: [], update: [], unchanged: 0, ignored: [] };
  for (const item of items) {
    const cur = existing.get(item.id);
    if (!cur) b.create.push(item);
    else if (sameFields(item, cur, fields)) b.unchanged++;
    else if (cur.origin === 'oficina') b.ignored.push(item); // editado pela oficina: nunca sobrescrever
    else b.update.push(item);
  }
  return b;
}

/** Compara o arquivo com o banco: o que criar, atualizar, deixar como está ou ignorar. Rodar duas vezes não duplica nada. */
export function planImport(payload: CatalogPayload, existing: Existing, parseErrors: RowError[] = []): ImportPlan {
  const errors = [...parseErrors];
  const dedupe = <T extends { id: string }>(list: T[], label: string) => {
    const seen = new Set<string>();
    return list.filter((x) => {
      if (seen.has(x.id)) { errors.push({ where: `${label} ${x.id}`, message: 'id repetido no arquivo (mantida a 1ª ocorrência)' }); return false; }
      seen.add(x.id);
      return true;
    });
  };
  const brands = dedupe(payload.brands, 'marca');
  const brandIds = new Set([...brands.map((b) => b.id), ...existing.brands.keys()]);
  const models = dedupe(payload.models, 'modelo').filter((m) => {
    if (brandIds.has(m.brand_id)) return true;
    errors.push({ where: `modelo ${m.id}`, message: `marca "${m.brand_id}" não existe` });
    return false;
  });
  const modelIds = new Set([...models.map((m) => m.id), ...existing.models.keys()]);
  const applications = dedupe(payload.applications, 'aplicação').filter((a) => {
    if (modelIds.has(a.model_id)) return true;
    errors.push({ where: `aplicação ${a.id}`, message: `modelo "${a.model_id}" não existe` });
    return false;
  });
  return {
    brands: bucket(brands, existing.brands, BRAND_FIELDS),
    models: bucket(models, existing.models, MODEL_FIELDS),
    applications: bucket(applications, existing.applications, APP_FIELDS),
    errors,
  };
}

// ---------- Exibição ----------

/** Ordem de exibição dos sistemas (os demais vêm depois, em ordem alfabética). */
const SYSTEM_ORDER = ['óleo do motor', 'combustível', 'ar do motor', 'hidráulico', 'hidráulico/transmissão', 'transmissão', 'direção hidráulica', 'cabine'];

export interface SystemGroup<T> { system: string; items: T[]; alternatives: boolean }

/**
 * Agrupa aplicações por sistema. Mais de um código para a mesma posição no mesmo sistema
 * indica versões alternativas (motor/ano/chassi), não peças simultâneas.
 */
export function groupBySystem<T extends { system: string; position: string | null }>(apps: T[]): SystemGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const a of apps) {
    const list = map.get(a.system) ?? [];
    list.push(a);
    map.set(a.system, list);
  }
  const rank = (s: string) => {
    const i = SYSTEM_ORDER.indexOf(s.toLowerCase());
    return i < 0 ? SYSTEM_ORDER.length : i;
  };
  return [...map.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'pt-BR'))
    .map(([system, items]) => {
      const perPosition = new Map<string, number>();
      for (const it of items) perPosition.set(it.position ?? '', (perPosition.get(it.position ?? '') ?? 0) + 1);
      return { system, items, alternatives: [...perPosition.values()].some((n) => n > 1) };
    });
}

/** Tipo de filtro do cadastro do trator correspondente ao sistema do catálogo. */
export function systemToFilterType(system: string): FilterType {
  const s = system.toLowerCase();
  if (s.includes('óleo do motor') || s === 'oleo do motor') return 'oleo';
  if (s.includes('combust')) return 'combustivel';
  if (s.startsWith('ar')) return 'ar';
  if (s.includes('hidr') || s.includes('transmiss') || s.includes('direção')) return 'hidraulico';
  return 'outros';
}

/** Normaliza para comparar marca/modelo digitados livremente no trator com o catálogo. */
export function normalizeName(text: string): string {
  return slugify(text).replace(/-/g, '');
}
