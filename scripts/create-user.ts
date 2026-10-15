// Cria (ou redefine a senha de) um usuário da oficina. Não existe cadastro público.
// Uso: npm run user:create -- <usuario> "<Nome>" [senha]
import { randomBytes } from 'node:crypto';
import { openDb } from '../src/lib/db.ts';
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
const db = openDb(process.env.DATABASE_PATH || 'data/mga.db');
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number } | undefined;
if (existing) {
  db.prepare('UPDATE users SET name = ?, password_hash = ?, is_active = 1 WHERE id = ?').run(name, hashPassword(password), existing.id);
  console.log(`Senha redefinida para "${username}".`);
} else {
  db.prepare('INSERT INTO users (username, name, password_hash) VALUES (?, ?, ?)').run(username, name, hashPassword(password));
  console.log(`Usuário "${username}" criado.`);
}
if (!given) console.log(`Senha gerada (anote, não será exibida de novo): ${password}`);
