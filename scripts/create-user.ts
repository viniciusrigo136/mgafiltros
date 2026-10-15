// Cria (ou redefine a senha de) um usuário administrador. Não existe cadastro público.
// Uso: npm run user:create -- <usuario> "<Nome>" [senha]
// Usa TURSO_DATABASE_URL/TURSO_AUTH_TOKEN do .env.local se definidos; senão, o banco local.
import { randomBytes } from 'node:crypto';
import { openClient } from '../src/lib/db.ts';
import { hashPassword } from '../src/lib/password.ts';

const [username, name, given] = process.argv.slice(2);
if (!username || !name) {
  console.error('Uso: npm run user:create -- <usuario> "<Nome>" [senha]');
  process.exit(1);
}
if (given && given.length < 8) {
  console.error('A senha deve ter pelo menos 8 caracteres.');
  process.exit(1);
}
const password = given || randomBytes(9).toString('base64url');
const db = await openClient();
const existing = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] });
if (existing.rows.length) {
  await db.execute({
    sql: "UPDATE users SET name = ?, password_hash = ?, is_active = 1, role = 'admin' WHERE id = ?",
    args: [name, hashPassword(password), existing.rows[0].id],
  });
  console.log(`Senha redefinida para "${username}" (perfil administrador).`);
} else {
  await db.execute({
    sql: "INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, 'admin')",
    args: [username, name, hashPassword(password)],
  });
  console.log(`Administrador "${username}" criado.`);
}
if (!given) console.log(`Senha gerada (anote, não será exibida de novo): ${password}`);
db.close();
