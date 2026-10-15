// Utilitários compartilhados pelas server actions (este arquivo não é 'use server').
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Db } from './db';
import { FILTER_TYPES } from './format';
import { ValidationError } from './validate';

export type ActionState = { error?: string } | undefined;

/** Converte erros de validação/permissão em mensagem para o formulário; demais erros sobem. */
export async function guard(fn: () => Promise<void> | void): Promise<ActionState> {
  try {
    await fn();
  } catch (e) {
    const msg = friendlyError(e);
    if (msg) return { error: msg };
    throw e;
  }
  return undefined;
}

/** Para formulários simples (sem estado): erro vira aviso na página de destino. */
export async function guardRedirect(path: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const msg = friendlyError(e);
    if (!msg) throw e;
    redirect(withParam(path, 'erro', msg));
  }
}

function friendlyError(e: unknown): string | null {
  if (e instanceof ValidationError) return e.message;
  if (e instanceof Error && /constraint failed/i.test(e.message)) {
    console.error(e);
    if (/UNIQUE/i.test(e.message)) return 'Já existe um registro com esses dados (código ou nome repetido).';
    if (/FOREIGN KEY/i.test(e.message)) return 'Registro em uso por outros dados; não pode ser removido.';
    return 'Dados inconsistentes: verifique os campos e tente novamente.';
  }
  return null;
}

function withParam(target: string, key: string, msg: string) {
  const [path, hash] = target.split('#');
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}${key}=${encodeURIComponent(msg)}${hash ? `#${hash}` : ''}`;
}

export function done(path: string, msg: string): never {
  revalidatePath('/', 'layout');
  redirect(withParam(path, 'ok', msg));
}

// ---------- Filtros (linhas dinâmicas de formulário) ----------

export interface FilterInput { type: string; code: string; maker: string | null; qty: number; notes: string | null }

export function readFilterRows(fd: FormData, prefix = ''): FilterInput[] {
  const types = fd.getAll(`${prefix}filter_type`).map(String);
  const codes = fd.getAll(`${prefix}filter_code`).map((v) => String(v).trim());
  const makers = fd.getAll(`${prefix}filter_maker`).map((v) => String(v).trim());
  const qtys = fd.getAll(`${prefix}filter_qty`).map((v) => String(v).trim());
  const notes = fd.getAll(`${prefix}filter_notes`).map((v) => String(v).trim());
  const out: FilterInput[] = [];
  codes.forEach((code, i) => {
    if (!code) return;
    const type = types[i];
    if (!(FILTER_TYPES as readonly string[]).includes(type)) throw new ValidationError('Filtro: tipo inválido.');
    if (code.length > 80) throw new ValidationError('Filtro: referência muito longa.');
    const qty = qtys[i] ? Number(qtys[i]) : 1;
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new ValidationError(`Filtro ${code}: quantidade inválida.`);
    out.push({ type, code, maker: makers[i] || null, qty, notes: notes[i] || null });
  });
  return out;
}

/** Substitui os filtros de um trator ou modelo (tabela e coluna de dono informadas). */
export async function replaceFilters(db: Db, table: 'tractor_filters' | 'tractor_model_filters', ownerId: number, filters: FilterInput[]) {
  const col = table === 'tractor_filters' ? 'tractor_id' : 'model_id';
  await db.run(`DELETE FROM ${table} WHERE ${col} = ?`, ownerId);
  for (const f of filters) {
    await db.run(
      `INSERT INTO ${table} (${col}, filter_type, reference_code, manufacturer, quantity, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      ownerId, f.type, f.code, f.maker, f.qty, f.notes,
    );
  }
}

export async function snapshotFilters(db: Db, changeId: number, filters: FilterInput[]) {
  for (const f of filters) {
    await db.run(
      `INSERT INTO oil_change_filters (oil_change_id, filter_type_snapshot, reference_code_snapshot, manufacturer_snapshot, quantity)
       VALUES (?, ?, ?, ?, ?)`,
      changeId, f.type, f.code, f.maker, f.qty,
    );
  }
}
