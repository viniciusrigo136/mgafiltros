import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from './db';
import { SESSION_COOKIE, readSessionToken } from './session';
import { ValidationError } from './validate';

export type Role = 'admin' | 'mecanico' | 'consulta';
export const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', mecanico: 'Mecânico', consulta: 'Somente consulta' };

export interface User { id: number | null; username: string; name: string; role: Role }

/** Login só é exigido com REQUIRE_LOGIN=1. Sem ele, o sistema abre direto (uso local na oficina). */
export const loginEnabled = process.env.REQUIRE_LOGIN === '1';

const ANONYMOUS: User = { id: null, username: '', name: '', role: 'admin' };

export const getCurrentUser = cache(async (): Promise<User | null> => {
  // Ler cookies sempre torna as páginas dinâmicas: ligar o login depois não deixa páginas pré-renderizadas sem verificação.
  const store = await cookies();
  if (!loginEnabled) return ANONYMOUS;
  const userId = readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const user = getDb()
    .prepare('SELECT id, username, name, role FROM users WHERE id = ? AND is_active = 1')
    .get(userId) as User | undefined;
  return user ?? null;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export function canEdit(user: User): boolean {
  return user.role !== 'consulta';
}

/** Para mutações: bloqueia o perfil "Somente consulta". */
export async function requireEditor(): Promise<User> {
  const user = await requireUser();
  if (!canEdit(user)) throw new ValidationError('Seu perfil é somente consulta.');
  return user;
}

/** Para configurações, usuários, exclusões e backup. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== 'admin') throw new ValidationError('Ação restrita a administradores.');
  return user;
}
