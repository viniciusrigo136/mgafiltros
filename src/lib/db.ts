// Conexão SQLite (node:sqlite nativo) + migrações versionadas da pasta /migrations.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type Db = DatabaseSync;

const g = globalThis as unknown as { __mgaDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!g.__mgaDb) g.__mgaDb = openDb(process.env.DATABASE_PATH || 'data/mga.db');
  return g.__mgaDb;
}

export function openDb(file: string): DatabaseSync {
  const full = path.resolve(/* turbopackIgnore: true */ process.cwd(), file);
  mkdirSync(path.dirname(full), { recursive: true });
  const db = new DatabaseSync(full);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`);
  const dir = path.join(/* turbopackIgnore: true */ process.cwd(), 'migrations');
  const applied = new Set(
    (db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map((r) => r.name),
  );
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(name)) continue;
    transaction(db, () => {
      db.exec(readFileSync(path.join(dir, name), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    });
  }
}

/** Executa em transação com lock de escrita imediato (evita corridas entre cadastros simultâneos). */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Próximo número interno de trator — atômico e nunca reutilizado. Chamar dentro de transaction(). */
export function nextTractorNumber(db: DatabaseSync): number {
  const row = db
    .prepare("UPDATE sequences SET value = value + 1 WHERE name = 'tractor_number' RETURNING value")
    .get() as { value: number };
  return row.value;
}
