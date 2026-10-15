'use server';
// Catálogo de filtros: importação (pré-visualização + gravação), cadastro e confirmação por trator.
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import initialCatalog from '@/data/catalogo_agricola_inicial.json';
import { getDb, transaction } from './db';
import { requireAdmin, requireEditor } from './auth';
import { applyImport, getApplication, loadExisting } from './catalog';
import {
  VERIFICATION_STATUSES, parseCatalogCsv, parseCatalogJson, planImport, slugify, systemToFilterType,
  type CatalogPayload, type ImportPlan, type RowError,
} from './catalog-core';
import { todayInTimeZone } from './status';
import { ValidationError, date, number, text } from './validate';
import { done, guard, guardRedirect, type ActionState } from './action-utils';

export interface ImportSummary {
  error?: string;
  committed?: boolean;
  counts?: { label: string; create: number; update: number; unchanged: number; ignored: number }[];
  changes?: { kind: string; action: string; id: string; text: string }[];
  errors?: RowError[];
}

async function readPayload(fd: FormData): Promise<{ payload: CatalogPayload; errors: RowError[] }> {
  if (fd.get('builtin') === '1') return parseCatalogJson(JSON.stringify(initialCatalog));
  const files = fd.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new ValidationError('Selecione o arquivo JSON ou os CSVs do catálogo.');
  if (files.some((f) => f.size > 4 * 1024 * 1024)) throw new ValidationError('Arquivo maior que 4 MB.');
  const json = files.find((f) => f.name.toLowerCase().endsWith('.json'));
  if (json) return parseCatalogJson(await json.text());
  return parseCatalogCsv(await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() }))));
}

function summarize(plan: ImportPlan, committed: boolean): ImportSummary {
  const row = (label: string, b: { create: unknown[]; update: unknown[]; unchanged: number; ignored: unknown[] }) => ({
    label, create: b.create.length, update: b.update.length, unchanged: b.unchanged, ignored: b.ignored.length,
  });
  const changes: ImportSummary['changes'] = [
    ...plan.brands.create.map((b) => ({ kind: 'Marca', action: 'criar', id: b.id, text: b.name })),
    ...plan.brands.update.map((b) => ({ kind: 'Marca', action: 'atualizar', id: b.id, text: b.name })),
    ...plan.models.create.map((m) => ({ kind: 'Modelo', action: 'criar', id: m.id, text: m.model })),
    ...plan.models.update.map((m) => ({ kind: 'Modelo', action: 'atualizar', id: m.id, text: m.model })),
    ...plan.applications.create.map((a) => ({ kind: 'Aplicação', action: 'criar', id: a.id, text: `${a.system}: ${a.filter_code}` })),
    ...plan.applications.update.map((a) => ({ kind: 'Aplicação', action: 'atualizar', id: a.id, text: `${a.system}: ${a.filter_code}` })),
    ...plan.applications.ignored.map((a) => ({ kind: 'Aplicação', action: 'ignorar (editada pela oficina)', id: a.id, text: `${a.system}: ${a.filter_code}` })),
  ];
  return {
    committed,
    counts: [row('Marcas', plan.brands), row('Modelos', plan.models), row('Aplicações', plan.applications)],
    changes: changes.slice(0, 200),
    errors: plan.errors.slice(0, 100),
  };
}

/** Pré-visualização: nada é gravado. */
export async function previewCatalogImport(fd: FormData): Promise<ImportSummary> {
  try {
    await requireAdmin();
    const { payload, errors } = await readPayload(fd);
    return summarize(planImport(payload, await loadExisting(), errors), false);
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
}

/** Grava a importação (idempotente: rodar de novo não duplica; registros da oficina não são sobrescritos). */
export async function commitCatalogImport(fd: FormData): Promise<ImportSummary> {
  try {
    const user = await requireAdmin();
    const { payload, errors } = await readPayload(fd);
    const existing = await loadExisting();
    const plan = planImport(payload, existing, errors);
    await applyImport(plan, existing, user.name || null);
    revalidatePath('/', 'layout');
    return summarize(plan, true);
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
}

// ---------- Cadastro manual (origem "oficina") ----------

export async function saveCatalogBrand(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await guard(async () => {
    await requireEditor();
    const name = text(fd, 'name', 'Nome da marca', { required: true, max: 80 })!;
    const coverage = text(fd, 'coverage', 'Cobertura', { max: 40 });
    const id = String(fd.get('id') ?? '') || slugify(name);
    if (!id) throw new ValidationError('Nome inválido.');
    await (await getDb()).run(
      `INSERT INTO catalog_brands (id, name, coverage, origin) VALUES (?, ?, ?, 'oficina')
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, coverage = excluded.coverage, origin = 'oficina',
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
      id, name, coverage,
    );
  });
  if (r) return r;
  done('/catalogo/marcas', 'Marca salva.');
}

export async function saveCatalogModel(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = String(fd.get('id') ?? '');
  const r = await guard(async () => {
    await requireEditor();
    const brandId = text(fd, 'brand_id', 'Marca', { required: true, max: 100 })!;
    const model = text(fd, 'model', 'Modelo', { required: true, max: 80 })!;
    const engine = text(fd, 'engine_ref', 'Motor de referência', { max: 120 });
    const status = text(fd, 'catalog_status', 'Situação do catálogo', { max: 40 }) ?? 'parcial';
    const notes = text(fd, 'notes', 'Observação', { max: 1000 });
    const db = await getDb();
    if (!(await db.get('SELECT 1 AS ok FROM catalog_brands WHERE id = ?', brandId))) throw new ValidationError('Marca não encontrada.');
    if (!id) {
      id = slugify(`${brandId}-${model}`);
      if (await db.get('SELECT 1 AS ok FROM catalog_models WHERE id = ?', id)) throw new ValidationError('Esse modelo já existe no catálogo.');
    }
    await db.run(
      `INSERT INTO catalog_models (id, brand_id, model, engine_ref, catalog_status, notes, origin) VALUES (?, ?, ?, ?, ?, ?, 'oficina')
       ON CONFLICT (id) DO UPDATE SET brand_id = excluded.brand_id, model = excluded.model, engine_ref = excluded.engine_ref,
         catalog_status = excluded.catalog_status, notes = excluded.notes, origin = 'oficina',
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
      id, brandId, model, engine, status, notes,
    );
  });
  if (r) return r;
  done(`/catalogo/${encodeURIComponent(id)}`, 'Modelo salvo.');
}

/** Cria ou edita uma aplicação. Edição guarda o estado anterior no histórico e protege contra importações futuras. */
export async function saveCatalogApplication(_: ActionState, fd: FormData): Promise<ActionState> {
  const modelId = String(fd.get('model_id') ?? '');
  const r = await guard(async () => {
    const user = await requireEditor();
    const existingId = String(fd.get('id') ?? '');
    const system = text(fd, 'system', 'Sistema', { required: true, max: 60 })!;
    const code = text(fd, 'filter_code', 'Código do filtro', { required: true, max: 80 })!;
    const status = String(fd.get('verification_status') ?? 'pendente');
    if (!(VERIFICATION_STATUSES as readonly string[]).includes(status)) throw new ValidationError('Situação de verificação inválida.');
    const url = text(fd, 'source_url', 'Fonte (URL)', { max: 500 });
    if (url && !/^https?:\/\//i.test(url)) throw new ValidationError('Fonte: informe um endereço começando com http:// ou https://');
    const values = [
      system,
      text(fd, 'position', 'Posição', { max: 60 }),
      text(fd, 'filter_brand', 'Marca do filtro', { max: 80 }),
      code,
      text(fd, 'original_code', 'Código original', { max: 80 }),
      text(fd, 'version_condition', 'Condição de versão', { max: 300 }),
      number(fd, 'quantity', 'Quantidade', { integer: true, positive: true, max: 99 }),
      status,
      url,
      text(fd, 'notes', 'Observações', { max: 1000 }),
    ];
    await transaction(async (tx) => {
      if (!(await tx.get('SELECT 1 AS ok FROM catalog_models WHERE id = ?', modelId))) throw new ValidationError('Modelo não encontrado.');
      if (existingId) {
        const old = await tx.get<Record<string, unknown>>('SELECT * FROM catalog_applications WHERE id = ? AND model_id = ?', existingId, modelId);
        if (!old) throw new ValidationError('Aplicação não encontrada.');
        await tx.run('INSERT INTO catalog_application_history (application_id, snapshot, changed_by) VALUES (?, ?, ?)', existingId, JSON.stringify(old), user.name || 'oficina');
        await tx.run(
          `UPDATE catalog_applications SET system = ?, position = ?, filter_brand = ?, filter_code = ?, original_code = ?, version_condition = ?,
             quantity = ?, verification_status = ?, source_url = ?, notes = ?, origin = 'oficina', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
           WHERE id = ?`,
          ...values, existingId,
        );
      } else {
        await tx.run(
          `INSERT INTO catalog_applications (id, model_id, system, position, filter_brand, filter_code, original_code, version_condition,
             quantity, verification_status, source_url, notes, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'oficina')`,
          `ofc-${randomUUID().slice(0, 8)}`, modelId, ...values,
        );
      }
    });
  });
  if (r) return r;
  done(`/catalogo/${encodeURIComponent(modelId)}`, 'Aplicação salva.');
}

/** Desativa/reativa (nada é apagado; confirmações antigas continuam válidas no histórico). */
export async function setApplicationActive(fd: FormData) {
  const id = String(fd.get('id'));
  const app = await getApplication(id);
  const back = app ? `/catalogo/${encodeURIComponent(app.model_id)}` : '/catalogo';
  await guardRedirect(back, async () => {
    await requireEditor();
    await (await getDb()).run(
      "UPDATE catalog_applications SET is_active = ?, origin = 'oficina', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?",
      fd.get('active') === '1' ? 1 : 0, id,
    );
  });
  done(back, fd.get('active') === '1' ? 'Aplicação reativada.' : 'Aplicação desativada (histórico mantido).');
}

// ---------- Trator ↔ catálogo ----------

export async function linkTractorModel(fd: FormData) {
  const tractorId = Number(fd.get('tractor_id'));
  await guardRedirect(`/tratores/${tractorId}#catalogo`, async () => {
    await requireEditor();
    const modelId = String(fd.get('catalog_model_id') ?? '') || null;
    const db = await getDb();
    if (modelId && !(await db.get('SELECT 1 AS ok FROM catalog_models WHERE id = ?', modelId))) throw new ValidationError('Modelo do catálogo não encontrado.');
    await db.run('UPDATE tractors SET catalog_model_id = ? WHERE id = ?', modelId, tractorId);
  });
  done(`/tratores/${tractorId}#catalogo`, 'Modelo do catálogo vinculado ao trator.');
}

/**
 * Confirma (ou descarta) a aplicação real em UM trator. Não altera o catálogo nem outros tratores.
 * Só itens confirmados podem entrar nos filtros do trator (e daí em OS, estoque e trocas).
 */
export async function confirmTractorFilter(_: ActionState, fd: FormData): Promise<ActionState> {
  const tractorId = Number(fd.get('tractor_id'));
  let message = '';
  const r = await guard(async () => {
    const user = await requireEditor();
    const status = String(fd.get('status'));
    if (!['confirmado', 'descartado', 'candidato'].includes(status)) throw new ValidationError('Situação inválida.');
    const appId = String(fd.get('application_id') ?? '');
    const on = date(fd, 'confirmed_on', 'Data', { notAfter: todayInTimeZone() }) ?? todayInTimeZone();
    const responsible = text(fd, 'responsible', 'Responsável', { max: 120 }) ?? (user.name || null);
    const notes = text(fd, 'notes', 'Observação', { max: 1000 });
    const addToTractor = status === 'confirmado' && fd.get('add_to_tractor') === '1';
    await transaction(async (tx) => {
      const app = await tx.get<{ id: string; model_id: string; system: string; filter_brand: string | null; filter_code: string; version_condition: string | null; quantity: number | null; source_url: string | null }>(
        'SELECT * FROM catalog_applications WHERE id = ?', appId,
      );
      const t = await tx.get<{ catalog_model_id: string | null }>('SELECT catalog_model_id FROM tractors WHERE id = ?', tractorId);
      if (!app || !t) throw new ValidationError('Trator ou aplicação não encontrados.');
      if (t.catalog_model_id !== app.model_id) throw new ValidationError('Essa aplicação não é do modelo vinculado a este trator.');
      await tx.run(
        `INSERT INTO tractor_filter_confirmations (tractor_id, application_id, status, system, filter_brand, filter_code, version_condition,
           notes, confirmed_on, responsible, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        tractorId, app.id, status, app.system, app.filter_brand, app.filter_code, app.version_condition, notes, on, responsible, user.id,
      );
      message = status === 'confirmado' ? `Filtro ${app.filter_code} confirmado para este trator.`
        : status === 'descartado' ? `Filtro ${app.filter_code} descartado para este trator.` : 'Voltou a candidato.';
      if (addToTractor) {
        const dup = await tx.get('SELECT 1 AS ok FROM tractor_filters WHERE tractor_id = ? AND reference_code = ? COLLATE NOCASE', tractorId, app.filter_code);
        if (dup) message += ' Já estava nos filtros do trator.';
        else {
          await tx.run(
            'INSERT INTO tractor_filters (tractor_id, filter_type, reference_code, manufacturer, quantity, notes) VALUES (?, ?, ?, ?, ?, ?)',
            tractorId, systemToFilterType(app.system), app.filter_code, app.filter_brand, app.quantity ?? 1,
            `${app.system}; confirmado em ${on.split('-').reverse().join('/')}${responsible ? ` por ${responsible}` : ''}`,
          );
          message += ' Incluído nos filtros do trator.';
        }
      }
    });
  });
  if (r) return r;
  done(`/tratores/${tractorId}#catalogo`, message);
}
