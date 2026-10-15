import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, computeStatus, diffDays, isValidIsoDate, todayInTimeZone, type StatusInput } from '../src/lib/status.ts';

const base: StatusInput = {
  intervalHours: 150,
  intervalMonths: null,
  lastChange: { date: '2026-01-10', hours: 1000 },
  currentHours: 1000,
  hoursReadAt: '2026-01-10',
  today: '2026-02-01',
};

test('horas: próxima troca = última + intervalo', () => {
  const r = computeStatus({ ...base, currentHours: 1100 });
  assert.equal(r.nextHours, 1150);
  assert.equal(r.hoursRemaining, 50);
  assert.equal(r.status, 'em_dia');
});

test('horas: 1140 h = Próxima; 1150 h = Vencida (aceite)', () => {
  assert.equal(computeStatus({ ...base, currentHours: 1140 }).status, 'proxima');
  assert.equal(computeStatus({ ...base, currentHours: 1130 }).status, 'proxima'); // limiar de 20 h inclusivo
  assert.equal(computeStatus({ ...base, currentHours: 1129 }).status, 'em_dia');
  const v = computeStatus({ ...base, currentHours: 1150 });
  assert.equal(v.status, 'vencida');
  assert.equal(v.hoursRemaining, 0);
});

test('calendário: meses de calendário com fim de mês', () => {
  assert.equal(addMonths('2026-01-10', 6), '2026-07-10');
  assert.equal(addMonths('2026-08-31', 6), '2027-02-28');
  assert.equal(addMonths('2027-08-31', 6), '2028-02-29');
  assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
  assert.equal(diffDays('2026-02-28', '2026-03-01'), 1);
});

test('calendário: vence na data e avisa 15 dias antes', () => {
  const m: StatusInput = { ...base, intervalHours: null, intervalMonths: 6 };
  assert.equal(computeStatus({ ...m, today: '2026-06-24' }).status, 'em_dia'); // 16 dias
  assert.equal(computeStatus({ ...m, today: '2026-06-25' }).status, 'proxima'); // 15 dias
  const v = computeStatus({ ...m, today: '2026-07-10' });
  assert.equal(v.status, 'vencida');
  assert.equal(v.nextDate, '2026-07-10');
  assert.equal(v.daysRemaining, 0);
});

test('regra OU: data vence antes das horas', () => {
  const r = computeStatus({ ...base, intervalMonths: 6, currentHours: 1050, today: '2026-07-11' });
  assert.equal(r.status, 'vencida');
  assert.equal(r.hoursRemaining, 100);
  assert.equal(r.daysRemaining, -1);
  assert.equal(r.reasons.length, 1);
  assert.match(r.reasons[0], /meses/);
});

test('regra OU: horas vencem antes da data', () => {
  const r = computeStatus({ ...base, intervalMonths: 6, currentHours: 1160, today: '2026-03-01' });
  assert.equal(r.status, 'vencida');
  assert.match(r.reasons[0], /horímetro/);
});

test('sem dados: falta última troca, intervalo ou leitura', () => {
  const a = computeStatus({ ...base, lastChange: null });
  assert.equal(a.status, 'sem_dados');
  assert.deepEqual(a.missing, ['última troca de óleo']);
  assert.equal(a.nextHours, null);

  const b = computeStatus({ ...base, intervalHours: null });
  assert.equal(b.status, 'sem_dados');
  assert.match(b.missing[0], /intervalo/);

  const c = computeStatus({ ...base, currentHours: null, hoursReadAt: null });
  assert.equal(c.status, 'sem_dados');
  assert.deepEqual(c.missing, ['leitura do horímetro']);
});

test('sem leitura de horas mas prazo de meses vencido continua alertando', () => {
  const r = computeStatus({ ...base, intervalMonths: 6, currentHours: null, hoursReadAt: null, today: '2026-08-01' });
  assert.equal(r.status, 'vencida');
  assert.deepEqual(r.missing, ['leitura do horímetro']);
});

test('intervalo de meses não configurado não gera cálculo de data', () => {
  const r = computeStatus({ ...base, currentHours: 1010, today: '2030-01-01' });
  assert.equal(r.nextDate, null);
  assert.equal(r.daysRemaining, null);
  assert.equal(r.status, 'em_dia');
  assert.equal(r.readingAgeDays, diffDays('2026-01-10', '2030-01-01'));
});

test('datas: validação e fuso America/Sao_Paulo', () => {
  assert.ok(isValidIsoDate('2026-02-28'));
  assert.ok(!isValidIsoDate('2026-02-30'));
  assert.ok(!isValidIsoDate('10/02/2026'));
  // 02:30 UTC de 15/03 ainda é 14/03 em São Paulo (UTC-3).
  assert.equal(todayInTimeZone(new Date('2026-03-15T02:30:00Z')), '2026-03-14');
});
