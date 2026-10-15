// Dados DEMONSTRATIVOS em banco local separado (data/demo.db por padrão). Nunca rodar no banco real.
// Uso: npm run seed:demo   →   depois rode o app com DATABASE_PATH=data/demo.db
// Códigos de filtro, óleos e intervalos abaixo são fictícios (prefixo EX-), não use como referência técnica.
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { InValue } from '@libsql/client';
import { openClient } from '../src/lib/db.ts';
import { addMonths, todayInTimeZone } from '../src/lib/status.ts';

const file = path.resolve(process.env.DEMO_DATABASE_PATH || 'data/demo.db');
if (existsSync(file)) {
  console.error(`${file} já existe. Apague-o para recriar os dados de exemplo.`);
  process.exit(1);
}
mkdirSync(path.dirname(file), { recursive: true });
const db = await openClient(`file:${file}`);
const today = todayInTimeZone();
const run = async (sql: string, ...args: InValue[]) => db.execute({ sql, args });
const insert = async (sql: string, ...args: InValue[]) => Number((await run(sql, ...args)).lastInsertRowid);

const owner = (name: string, phone: string, city: string) =>
  insert('INSERT INTO owners (name, phone, city, notes) VALUES (?, ?, ?, ?)', name, phone, city, 'Dado de exemplo');
const a = await owner('[EXEMPLO] João da Silva', '54999990001', 'Erechim');
const b = await owner('[EXEMPLO] Fazenda Boa Vista', '54999990002', 'Getúlio Vargas');

async function tractor(ownerId: number, brand: string, model: string, hours: number, intH: number | null, intM: number | null,
  last: { monthsAgo: number; hours: number } | null) {
  const seq = Number((await run("UPDATE sequences SET value = value + 1 WHERE name = 'tractor_number' RETURNING value")).rows[0].value);
  const id = await insert(
    `INSERT INTO tractors (sequential_number, owner_id, brand, model, current_hours, hours_read_at, oil_spec, oil_capacity_liters, interval_hours, interval_months, notes)
     VALUES (?, ?, ?, ?, ?, ?, 'EX-ÓLEO 15W40 (exemplo)', 12, ?, ?, 'Trator de exemplo')`,
    seq, ownerId, brand, model, hours, today, intH, intM,
  );
  const filter = 'INSERT INTO tractor_filters (tractor_id, filter_type, reference_code, manufacturer, quantity) VALUES (?, ?, ?, ?, ?)';
  await run(filter, id, 'oleo', `EX-${1000 + seq}`, 'Exemplo', 1);
  await run(filter, id, 'combustivel', `EX-${2000 + seq}`, 'Exemplo', 2);
  await run(filter, id, 'ar', `EX-${3000 + seq}`, null, 1);
  await run('INSERT INTO hour_readings (tractor_id, hours, read_at) VALUES (?, ?, ?)', id, hours, today);
  if (last) {
    await run(
      `INSERT INTO oil_changes (tractor_id, serviced_at, service_hours, oil_used, liters_used, is_initial, notes)
       VALUES (?, ?, ?, 'EX-ÓLEO 15W40 (exemplo)', 12, 1, 'Exemplo')`,
      id, addMonths(today, -last.monthsAgo), last.hours,
    );
  }
}
await tractor(a, 'Marca A', 'Modelo 100', 1140, 150, 6, { monthsAgo: 2, hours: 1000 }); // Próxima (faltam 10 h)
await tractor(a, 'Marca B', 'Modelo 200', 2300, 250, null, { monthsAgo: 4, hours: 2000 }); // Vencida por horas
await tractor(b, 'Marca A', 'Modelo 300', 510, 250, 6, { monthsAgo: 7, hours: 400 }); // Vencida por data
await tractor(b, 'Marca C', 'Modelo 400', 800, 250, 12, { monthsAgo: 1, hours: 750 }); // Em dia
await tractor(b, 'Marca B', 'Modelo 500', 90, null, null, null); // Sem dados
db.close();
console.log(`Dados de exemplo criados em ${file}.`);
