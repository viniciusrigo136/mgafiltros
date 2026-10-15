import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getCurrentUser } from '@/lib/auth';
import { getAttachment, uploadsDir } from '@/lib/attachments';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response('Não autorizado', { status: 401 });
  const att = getAttachment(Number((await params).id));
  if (!att) return new Response('Não encontrado', { status: 404 });
  try {
    const data = await readFile(path.join(uploadsDir(), path.basename(att.stored_name)));
    return new Response(data, {
      headers: {
        'Content-Type': att.mime,
        'Content-Length': String(data.length),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.original_name)}`,
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return new Response('Arquivo ausente no servidor', { status: 404 });
  }
}
