// Anexos (fotos e PDFs) gravados em disco ao lado do banco.
import path from 'node:path';
import { getDb } from './db';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export function uploadsDir(): string {
  const dbFile = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DATABASE_PATH || 'data/mga.db');
  return path.join(path.dirname(dbFile), 'uploads');
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

export function listAttachments(where: { tractorId?: number; workOrderId?: number }): Attachment[] {
  const db = getDb();
  if (where.tractorId) {
    return db.prepare('SELECT * FROM attachments WHERE tractor_id = ? ORDER BY id DESC').all(where.tractorId) as unknown as Attachment[];
  }
  return db.prepare('SELECT * FROM attachments WHERE work_order_id = ? ORDER BY id DESC').all(where.workOrderId ?? 0) as unknown as Attachment[];
}

export function getAttachment(id: number): Attachment | null {
  return (getDb().prepare('SELECT * FROM attachments WHERE id = ?').get(id) as unknown as Attachment | undefined) ?? null;
}
