import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { findTractorIdByNumber } from '@/lib/data';

/** Busca rápida: número abre a ficha direto; texto vai para a lista filtrada. */
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  if (!(await getCurrentUser())) return to('/login');
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return to('/tratores');
  if (/^\d+$/.test(q)) {
    const n = Number(q);
    const tractorId = findTractorIdByNumber(n);
    return to(tractorId ? `/tratores/${tractorId}` : `/?nao_encontrado=${n}`);
  }
  return to(`/tratores?q=${encodeURIComponent(q)}`);
}
