// Token de sessão assinado (HMAC-SHA256): "<userId>.<expiraEmMs>.<assinatura>". Usado também pelo proxy.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'mga_session';
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 14; // 14 dias

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET ausente ou curto (mín. 32 caracteres). Veja .env.example.');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionToken(userId: number): string {
  const payload = `${userId}.${Date.now() + SESSION_MAX_AGE_S * 1000}`;
  return `${payload}.${sign(payload)}`;
}

/** Retorna o id do usuário se o token for válido e não expirado. */
export function readSessionToken(token: string | undefined): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts;
  const expected = Buffer.from(sign(`${id}.${exp}`));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (!(Number(exp) > Date.now())) return null;
  const userId = Number(id);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}
