import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStatus, estimateHoursDueDate, usageRate } from '../src/lib/status.ts';
import { parseCsv, toCsv } from '../src/lib/csv.ts';
import { orderTotals } from '../src/lib/money.ts';

test('limiares configuráveis', () => {
  const input = {
    intervalHours: 150, intervalMonths: null, lastChange: { date: '2026-01-10', hours: 1000 },
    currentHours: 1120, hoursReadAt: '2026-01-20', today: '2026-01-20',
  };
  assert.equal(computeStatus(input).status, 'em_dia'); // faltam 30 h > 20 h padrão
  assert.equal(computeStatus({ ...input, thresholds: { hours: 40, days: 15, staleReadingDays: 30 } }).status, 'proxima');
});

test('uso médio e data estimada por horas', () => {
  const readings = [
    { hours: 1000, read_at: '2026-01-01' },
    { hours: 1050, read_at: '2026-01-11' },
    { hours: 1100, read_at: '2026-01-21' },
  ];
  const rate = usageRate(readings, '2026-01-21');
  assert.equal(rate, 5);
  assert.equal(estimateHoursDueDate(50, rate, '2026-01-21'), '2026-01-31');
  assert.equal(estimateHoursDueDate(-5, rate, '2026-01-21'), '2026-01-21');
});

test('uso médio exige base mínima', () => {
  assert.equal(usageRate([{ hours: 1, read_at: '2026-01-01' }], '2026-01-02'), null);
  assert.equal(usageRate([{ hours: 1, read_at: '2026-01-01' }, { hours: 5, read_at: '2026-01-03' }], '2026-01-03'), null);
  assert.equal(usageRate([{ hours: 9, read_at: '2026-01-01' }, { hours: 5, read_at: '2026-02-03' }], '2026-02-03'), null);
  assert.equal(estimateHoursDueDate(10, null, '2026-01-01'), null);
});

test('CSV: ida e volta com aspas, separador e proteção contra fórmula', () => {
  const csv = toCsv(['nome', 'obs', 'n'], [['João; Filho', 'diz "oi"', 1.5], ['=SOMA(A1)', null, 2]]);
  assert.ok(csv.startsWith('﻿'));
  const rows = parseCsv(csv);
  assert.deepEqual(rows[1], ['João; Filho', 'diz "oi"', '1,5']);
  assert.deepEqual(rows[2], ["'=SOMA(A1)", '', '2']);
  assert.deepEqual(parseCsv('a,b\n1,2\n\n'), [['a', 'b'], ['1', '2']]);
});

test('totais de OS com desconto limitado ao subtotal', () => {
  const t = orderTotals([
    { kind: 'peca', quantity: 2, unit_price: 45.9 },
    { kind: 'servico', quantity: 1.5, unit_price: 120 },
  ], 10);
  assert.deepEqual(t, { parts: 91.8, labor: 180, subtotal: 271.8, discount: 10, total: 261.8 });
  assert.equal(orderTotals([{ kind: 'peca', quantity: 1, unit_price: 5 }], 50).total, 0);
});
