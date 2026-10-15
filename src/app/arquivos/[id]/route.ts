import { getCurrentUser } from '@/lib/auth';
import { getAttachment, loadFile } from '@/lib/attachments';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response('Não autorizado', { status: 401 });
  const att = await getAttachment(Number((await params).id));
  if (!att) return new Response('Não encontrado', { status: 404 });
  const body = await loadFile(att.stored_name);
  if (!body) return new Response('Arquivo ausente no armazenamento', { status: 404 });
  return new Response(body instanceof Buffer ? new Uint8Array(body) : (body as ReadableStream<Uint8Array<ArrayBuffer>>), {
    headers: {
      'Content-Type': att.mime,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.original_name)}`,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
