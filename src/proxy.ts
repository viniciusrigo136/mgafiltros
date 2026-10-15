import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, readSessionToken } from '@/lib/session';

// Checagem otimista: sem sessão válida, vai para o login. A verificação completa
// (usuário ativo no banco) acontece em requireUser() nas páginas e ações.
export function proxy(request: NextRequest) {
  const isLogin = request.nextUrl.pathname === '/login';
  // Login desligado (padrão): tudo liberado e /login volta ao painel.
  if (process.env.REQUIRE_LOGIN !== '1') {
    return isLogin ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }
  const valid = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value) !== null;
  if (!valid && !isLogin) return NextResponse.redirect(new URL('/login', request.url));
  if (valid && isLogin) return NextResponse.redirect(new URL('/', request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|offline.html).*)'],
};
