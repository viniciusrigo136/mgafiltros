// Cópia consistente do banco (VACUUM INTO) para download. Somente administradores.
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { todayInTimeZone } from '@/lib/status';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response('Não autorizado', { status: 401 });
  if (user.role !== 'admin') return new Response('Restrito a administradores', { status: 403 });
  const file = path.join(tmpdir(), `mga-backup-${randomUUID()}.db`);
  try {
    getDb().prepare('VACUUM INTO ?').run(file);
    const data = await readFile(file);
    return new Response(data, {
      headers: {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Disposition': `attachment; filename="mga-backup-${todayInTimeZone()}.db"`,
        'Cache-Control': 'no-store',
      },
    });
  } finally {
    await rm(file, { force: true });
  }
}
