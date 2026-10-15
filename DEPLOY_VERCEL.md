# Publicar na Vercel

A Vercel não tem disco permanente, então o sistema usa:
- **Turso** (SQLite na nuvem) para o banco;
- **Vercel Blob** (privado) para fotos e PDFs.

## 1. Banco (Turso)
1. Crie uma conta em https://turso.tech e um banco (região próxima da Vercel, ex.: São Paulo `gru` ou a mesma das funções).
2. Copie a **URL** (`libsql://...`) e gere um **token** (Database → Create Token).
3. As tabelas são criadas sozinhas no primeiro acesso.

## 2. Fotos (Vercel Blob)
Vercel → projeto → **Storage** → Create → **Blob** → acesso **Private** → conectar ao projeto.
Isso cria a variável `BLOB_READ_WRITE_TOKEN` automaticamente.

## 3. Variáveis de ambiente (Vercel → Settings → Environment Variables)
| Nome | Valor |
|---|---|
| `TURSO_DATABASE_URL` | `libsql://seu-banco.turso.io` |
| `TURSO_AUTH_TOKEN` | token do Turso |
| `BLOB_READ_WRITE_TOKEN` | criado pelo passo 2 |
| `REQUIRE_LOGIN` | `1` (recomendado na internet) |
| `SESSION_SECRET` | 48+ caracteres aleatórios |

Depois: **Deployments → Redeploy**.

## 4. Primeiro administrador (com login ligado)
No computador, com as variáveis do Turso no `.env.local`:
```bash
npm run user:create -- admin "Seu Nome" SuaSenhaForte123
```

## Atenção
- Sem `REQUIRE_LOGIN=1`, qualquer pessoa com o endereço `*.vercel.app` vê e altera os dados.
- Backup: Configurações → “Baixar backup” (JSON). O Turso também guarda histórico para restauração.
