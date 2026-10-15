// Backup completo em JSON (todas as tabelas). Somente administradores.
// Com Turso, o próprio serviço também mantém histórico para restauração (point-in-time).
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { todayInTimeZone } from '@/lib/status';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response('Não autorizado', { status: 401 });
  if (user.role !== 'admin') return new Response('Restrito a administradores', { status: 403 });
  const db = await getDb();
  const tables = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' ORDER BY name",
  );
  const dump: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    const rows = await db.all<Record<string, unknown>>(`SELECT * FROM "${name.replace(/"/g, '""')}"`);
    // Senhas (hash) não vão para o arquivo de backup.
    dump[name] = name === 'users' ? rows.map((r) => ({ ...r, password_hash: undefined })) : rows;
  }
  const body = JSON.stringify({ app: 'mga-manutencao', exported_at: new Date().toISOString(), tables: dump }, null, 1);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="mga-backup-${todayInTimeZone()}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
