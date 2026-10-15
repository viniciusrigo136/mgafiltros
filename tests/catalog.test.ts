import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  groupBySystem, parseCatalogCsv, parseCatalogJson, planImport, systemToFilterType,
  type CatalogApplication, type Existing, type Origin,
} from '../src/lib/catalog-core.ts';

const text = readFileSync(new URL('../src/data/catalogo_agricola_inicial.json', import.meta.url), 'utf8');
const { payload, errors } = parseCatalogJson(text);
const empty = (): Existing => ({ brands: new Map(), models: new Map(), applications: new Map() });
const apps = (modelId: string) => payload.applications.filter((a) => a.model_id === modelId);

/** Simula o banco depois de aplicar o plano (origem "importado"). */
function afterImport(origin: Origin = 'importado'): Existing {
  const e = empty();
  for (const b of payload.brands) e.brands.set(b.id, { ...b, origin });
  for (const m of payload.models) e.models.set(m.id, { ...m, origin });
  for (const a of payload.applications) e.applications.set(a.id, { ...a, origin });
  return e;
}

test('catálogo inicial: 12 marcas, 28 modelos, 110 aplicações, sem erros', () => {
  assert.deepEqual(errors, []);
  assert.equal(payload.brands.length, 12);
  assert.equal(payload.models.length, 28);
  assert.equal(payload.applications.length, 110);
  assert.ok(payload.applications.every((a) => a.verification_status === 'catalogo_aplicacao_geral'));
});

test('primeira importação cria tudo; a segunda não duplica nem altera', () => {
  const first = planImport(payload, empty());
  assert.equal(first.brands.create.length, 12);
  assert.equal(first.applications.create.length, 110);
  const second = planImport(payload, afterImport());
  assert.equal(second.applications.create.length + second.applications.update.length, 0);
  assert.equal(second.applications.unchanged, 110);
  assert.equal(second.models.unchanged, 28);
});

test('não sobrescreve aplicação editada pela oficina', () => {
  const existing = afterImport();
  const app = existing.applications.get('apl-0001')!;
  existing.applications.set('apl-0001', { ...app, filter_code: '1909101-CONFIRMADO', origin: 'oficina' });
  const plan = planImport(payload, existing);
  assert.equal(plan.applications.update.length, 0);
  assert.deepEqual(plan.applications.ignored.map((a) => a.id), ['apl-0001']);
});

test('atualiza registro importado quando o arquivo muda', () => {
  const existing = afterImport();
  const app = existing.applications.get('apl-0002')!;
  existing.applications.set('apl-0002', { ...app, notes: 'texto antigo' });
  assert.deepEqual(planImport(payload, existing).applications.update.map((a) => a.id), ['apl-0002']);
});

test('código do filtro preservado como texto', () => {
  const codes = payload.applications.map((a) => a.filter_code);
  assert.ok(codes.includes('C 17 337/3'));
  assert.ok(codes.includes('W 962/24'));
  const csv = parseCatalogCsv([{
    name: 'a.csv',
    text: 'id;modelo_id;tipo_filtro;codigo_filtro\napl-x;m;ar do motor; 0012 34/5 \n',
  }]);
  assert.equal(csv.payload.applications[0].filter_code, '0012 34/5');
});

test('New Holland TT75: variantes Tier 1/Tier 2 do óleo como alternativas, não simultâneas', () => {
  const groups = groupBySystem(apps('new-holland-tt75'));
  const oil = groups.find((g) => g.system === 'óleo do motor')!;
  const versions = oil.items.map((a) => a.version_condition ?? '');
  assert.ok(versions.some((v) => v.includes('Tier 1')));
  assert.ok(versions.some((v) => v.includes('Tier 2')));
  assert.equal(oil.alternatives, true);
  assert.equal(groups[0].system, 'óleo do motor');
});

test('Case IH Farmall 80: motor, ar, combustível, hidráulico e cabine com variantes', () => {
  const systems = groupBySystem(apps('case-ih-farmall-80')).map((g) => g.system);
  for (const s of ['óleo do motor', 'ar do motor', 'combustível', 'hidráulico', 'cabine']) assert.ok(systems.includes(s), s);
  assert.ok(apps('case-ih-farmall-80').some((a) => a.system === 'cabine' && /cabine/i.test(a.version_condition ?? '')));
});

test('Valtra BM 110: W 962/24 é hidráulico/transmissão, não óleo do motor', () => {
  const w962 = apps('valtra-bm-110').filter((a) => a.filter_code === 'W 962/24');
  assert.equal(w962.length, 1);
  assert.equal(w962[0].system, 'hidráulico/transmissão');
  assert.equal(systemToFilterType(w962[0].system), 'hidraulico');
});

test('John Deere 5075E: todas as aplicações têm fonte', () => {
  const list = apps('john-deere-5075e');
  assert.ok(list.length > 0);
  assert.ok(list.every((a: CatalogApplication) => a.source_url?.startsWith('https://')));
});

test('validação: referências inexistentes e status de confirmação não entram no catálogo geral', () => {
  const bad = parseCatalogJson(JSON.stringify({
    marcas: [{ id: 'x', nome: 'X' }],
    modelos: [{ id: 'x-1', brand_id: 'nao-existe', modelo: '1' }],
    aplicacoes_filtros: [
      { id: 'a1', modelo_id: 'x-1', tipo_filtro: 'ar', codigo_filtro: 'A', status_verificacao: 'confirmado_no_equipamento' },
      { id: 'a2', modelo_id: 'fantasma', tipo_filtro: 'ar', codigo_filtro: 'B' },
    ],
  }));
  assert.ok(bad.errors.some((e) => e.where === 'aplicação a1'));
  const plan = planImport(bad.payload, empty(), bad.errors);
  assert.ok(plan.errors.some((e) => e.message.includes('marca "nao-existe"')));
  assert.ok(plan.errors.some((e) => e.message.includes('modelo "fantasma"')));
  assert.equal(plan.applications.create.length, 0);
});
