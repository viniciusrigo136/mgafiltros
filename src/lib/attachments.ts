// Anexos (fotos e PDFs): Vercel Blob privado em produção; pasta local em desenvolvimento.
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { del, get, put } from '@vercel/blob';
import { getDb } from './db';

/** Limite por arquivo. Na Vercel cada envio aceita ~4,5 MB; fotos são reduzidas no navegador antes do envio. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

function localDir(): string {
  const dbFile = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DATABASE_PATH || 'data/mga.db');
  return path.join(path.dirname(dbFile), 'uploads');
}

export async function storeFile(name: string, data: Buffer, mime: string): Promise<void> {
  if (blobEnabled()) {
    await put(`anexos/${name}`, data, { access: 'private', contentType: mime, addRandomSuffix: false });
    return;
  }
  if (process.env.VERCEL) throw new Error('BLOB_READ_WRITE_TOKEN não configurado: crie um Blob Store na Vercel.');
  await mkdir(localDir(), { recursive: true });
  await writeFile(path.join(localDir(), path.basename(name)), data);
}

/** Conteúdo do arquivo como stream (Blob) ou buffer (local); null se não existir. */
export async function loadFile(name: string): Promise<ReadableStream<Uint8Array> | Buffer | null> {
  if (blobEnabled()) {
    const res = await get(`anexos/${name}`, { access: 'private' });
    return res && res.statusCode === 200 ? res.stream : null;
  }
  return readFile(path.join(localDir(), path.basename(name))).catch(() => null);
}

export async function removeFile(name: string): Promise<void> {
  if (blobEnabled()) await del(`anexos/${name}`).catch(() => undefined);
  else await unlink(path.join(localDir(), path.basename(name))).catch(() => undefined);
}

export interface Attachment {
  id: number;
  tractor_id: number | null;
  work_order_id: number | null;
  stored_name: string;
  original_name: string;
  mime: string;
  size: number;
  caption: string | null;
  created_at: string;
}

export async function listAttachments(where: { tractorId?: number; workOrderId?: number }): Promise<Attachment[]> {
  const db = await getDb();
  if (where.tractorId) return db.all<Attachment>('SELECT * FROM attachments WHERE tractor_id = ? ORDER BY id DESC', where.tractorId);
  return db.all<Attachment>('SELECT * FROM attachments WHERE work_order_id = ? ORDER BY id DESC', where.workOrderId ?? 0);
}

export async function getAttachment(id: number): Promise<Attachment | null> {
  return (await (await getDb()).get<Attachment>('SELECT * FROM attachments WHERE id = ?', id)) ?? null;
}
