// Banco libSQL: Turso em produção (TURSO_DATABASE_URL) ou arquivo SQLite local em desenvolvimento.
// Mesmo dialeto SQL nos dois casos. Migrações aplicadas na primeira conexão de cada instância.
import { createClient, type Client, type InValue, type Transaction } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './migrations.ts';

export type Arg = InValue | undefined;

/** Interface única para consultas, fora ou dentro de transação. */
export interface Db {
  all<T>(sql: string, ...args: Arg[]): Promise<T[]>;
  get<T>(sql: string, ...args: Arg[]): Promise<T | undefined>;
  run(sql: string, ...args: Arg[]): Promise<{ lastInsertRowid: number; changes: number }>;
  /** Vários comandos de uma vez (uma ida ao banco), tudo ou nada. */
  batch(statements: { sql: string; args: Arg[] }[]): Promise<void>;
}

const g = globalThis as unknown as { __mgaClient?: Promise<Client> };

function databaseUrl(): string {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  if (process.env.VERCEL) throw new Error('TURSO_DATABASE_URL não configurada nas variáveis de ambiente da Vercel.');
  const file = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DATABASE_PATH || 'data/mga.db');
  mkdirSync(path.dirname(file), { recursive: true });
  return `file:${file}`;
}

export async function openClient(url = databaseUrl(), authToken = process.env.TURSO_AUTH_TOKEN): Promise<Client> {
  const client = createClient({ url, authToken, intMode: 'number' });
  await client.execute('PRAGMA foreign_keys = ON');
  await migrate(client);
  return client;
}

function client(): Promise<Client> {
  if (!g.__mgaClient) {
    g.__mgaClient = openClient().catch((e) => {
      g.__mgaClient = undefined; // permite nova tentativa na próxima requisição
      throw e;
    });
  }
  return g.__mgaClient;
}

async function migrate(c: Client) {
  await c.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`);
  const applied = new Set((await c.execute('SELECT name FROM schema_migrations')).rows.map((r) => String(r.name)));
  if (MIGRATIONS.every((m) => applied.has(m.name))) return;
  const tx = await c.transaction('write');
  try {
    // Relê dentro do lock de escrita: outra instância pode ter migrado enquanto isso.
    const done = new Set((await tx.execute('SELECT name FROM schema_migrations')).rows.map((r) => String(r.name)));
    for (const m of MIGRATIONS) {
      if (done.has(m.name)) continue;
      await tx.executeMultiple(m.sql);
      await tx.execute({ sql: 'INSERT INTO schema_migrations (name) VALUES (?)', args: [m.name] });
    }
    await tx.commit();
  } finally {
    tx.close();
  }
}

function wrap(exec: Client | Transaction): Db {
  const query = (sql: string, args: Arg[]) => exec.execute({ sql, args: args.map((a) => (a === undefined ? null : a)) });
  const toObjects = <T>(rs: Awaited<ReturnType<typeof query>>) =>
    rs.rows.map((row) => Object.fromEntries(rs.columns.map((col, i) => [col, row[i]])) as T);
  return {
    async all<T>(sql: string, ...args: Arg[]) {
      return toObjects<T>(await query(sql, args));
    },
    async get<T>(sql: string, ...args: Arg[]) {
      return toObjects<T>(await query(sql, args))[0];
    },
    async run(sql: string, ...args: Arg[]) {
      const rs = await query(sql, args);
      return { lastInsertRowid: Number(rs.lastInsertRowid ?? 0), changes: rs.rowsAffected };
    },
    async batch(statements) {
      if (!statements.length) return;
      const stmts = statements.map((s) => ({ sql: s.sql, args: s.args.map((a) => (a === undefined ? null : a)) }));
      // Fora de transação o batch é atômico ('write'); dentro, segue a transação em curso.
      if ('commit' in exec) await exec.batch(stmts);
      else await exec.batch(stmts, 'write');
    },
  };
}

export async function getDb(): Promise<Db> {
  return wrap(await client());
}

/** Transação de escrita: tudo ou nada. */
export async function transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  const tx = await (await client()).transaction('write');
  try {
    const result = await fn(wrap(tx));
    await tx.commit();
    return result;
  } catch (e) {
    await tx.rollback().catch(() => undefined);
    throw e;
  } finally {
    tx.close();
  }
}

/** Próximo número interno de trator — atômico e nunca reutilizado. Chamar dentro de transaction(). */
export async function nextTractorNumber(tx: Db): Promise<number> {
  const row = await tx.get<{ value: number }>("UPDATE sequences SET value = value + 1 WHERE name = 'tractor_number' RETURNING value");
  return row!.value;
}
