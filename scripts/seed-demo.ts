// Dados DEMONSTRATIVOS em banco separado (data/demo.db por padrão). Nunca rodar no banco real.
// Uso: npm run seed:demo   →   depois rode o app com DATABASE_PATH=data/demo.db
// Códigos de filtro, óleos e intervalos abaixo são fictícios (prefixo EX-), não use como referência técnica.
import { existsSync } from 'node:fs';
import { openDb, nextTractorNumber, transaction } from '../src/lib/db.ts';
import { addMonths, todayInTimeZone } from '../src/lib/status.ts';

const file = process.env.DEMO_DATABASE_PATH || 'data/demo.db';
if (existsSync(file)) {
  console.error(`${file} já existe. Apague-o para recriar os dados de exemplo.`);
  process.exit(1);
}
const db = openDb(file);
const today = todayInTimeZone();

transaction(db, () => {
  const owner = (name: string, phone: string, city: string) =>
    Number(db.prepare('INSERT INTO owners (name, phone, city, notes) VALUES (?, ?, ?, ?)').run(name, phone, city, 'Dado de exemplo').lastInsertRowid);
  const a = owner('[EXEMPLO] João da Silva', '54999990001', 'Erechim');
  const b = owner('[EXEMPLO] Fazenda Boa Vista', '54999990002', 'Getúlio Vargas');

  const tractor = (ownerId: number, brand: string, model: string, hours: number, intH: number | null, intM: number | null,
    last: { monthsAgo: number; hours: number } | null) => {
    const seq = nextTractorNumber(db);
    const id = Number(db.prepare(
      `INSERT INTO tractors (sequential_number, owner_id, brand, model, current_hours, hours_read_at, oil_spec, oil_capacity_liters, interval_hours, interval_months, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'EX-ÓLEO 15W40 (exemplo)', 12, ?, ?, 'Trator de exemplo')`,
    ).run(seq, ownerId, brand, model, hours, today, intH, intM).lastInsertRowid);
    const f = db.prepare('INSERT INTO tractor_filters (tractor_id, filter_type, reference_code, manufacturer, quantity) VALUES (?, ?, ?, ?, ?)');
    f.run(id, 'oleo', `EX-${1000 + seq}`, 'Exemplo', 1);
    f.run(id, 'combustivel', `EX-${2000 + seq}`, 'Exemplo', 2);
    f.run(id, 'ar', `EX-${3000 + seq}`, null, 1);
    db.prepare('INSERT INTO hour_readings (tractor_id, hours, read_at) VALUES (?, ?, ?)').run(id, hours, today);
    if (last) {
      db.prepare(`INSERT INTO oil_changes (tractor_id, serviced_at, service_hours, oil_used, liters_used, is_initial, notes)
        VALUES (?, ?, ?, 'EX-ÓLEO 15W40 (exemplo)', 12, 1, 'Exemplo')`).run(id, addMonths(today, -last.monthsAgo), last.hours);
    }
  };
  tractor(a, 'Marca A', 'Modelo 100', 1140, 150, 6, { monthsAgo: 2, hours: 1000 }); // Próxima (faltam 10 h)
  tractor(a, 'Marca B', 'Modelo 200', 2300, 250, null, { monthsAgo: 4, hours: 2000 }); // Vencida por horas
  tractor(b, 'Marca A', 'Modelo 300', 510, 250, 6, { monthsAgo: 7, hours: 400 }); // Vencida por data
  tractor(b, 'Marca C', 'Modelo 400', 800, 250, 12, { monthsAgo: 1, hours: 750 }); // Em dia
  tractor(b, 'Marca B', 'Modelo 500', 90, null, null, null); // Sem dados
});
console.log(`Dados de exemplo criados em ${file}.`);
