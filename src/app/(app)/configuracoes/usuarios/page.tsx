import type { Metadata } from 'next';
import { saveUser, setUserActive } from '@/lib/actions-admin';
import { ROLE_LABEL, loginEnabled, requireUser, type Role } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { ActionForm } from '@/components/ActionForm';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Flash, PageHead, one, type SearchParams } from '@/components/ui';

export const metadata: Metadata = { title: 'Usuários' };

interface Row { id: number; username: string; name: string; role: Role; is_active: number }

function RoleSelect({ value }: { value?: Role }) {
  return (
    <select name="role" defaultValue={value ?? 'mecanico'}>
      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
    </select>
  );
}

export default async function Usuarios({ searchParams }: { searchParams: SearchParams }) {
  const [sp, user] = await Promise.all([searchParams, requireUser()]);
  const users = await (await getDb()).all<Row>('SELECT id, username, name, role, is_active FROM users ORDER BY is_active DESC, name');
  const isAdmin = user.role === 'admin';

  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <PageHead title="Usuários e acesso" back={{ href: '/configuracoes', label: 'Configurações' }} />
      <section className="card">
        <h2>Login {loginEnabled ? 'ativo' : 'desligado'}</h2>
        {loginEnabled ? (
          <p>O sistema exige usuário e senha. Perfis: <strong>Administrador</strong> (tudo), <strong>Mecânico</strong> (cadastros e serviços) e <strong>Somente consulta</strong> (apenas visualizar).</p>
        ) : (
          <p className="alert alert-warn">
            O sistema abre sem login: qualquer pessoa que acesse o endereço pode ver e alterar dados. Para exigir login, crie ao menos um
            administrador abaixo e defina <code>REQUIRE_LOGIN=1</code> e <code>SESSION_SECRET</code> no arquivo <code>.env.local</code>, depois reinicie o sistema.
          </p>
        )}
      </section>

      {isAdmin ? (
        <>
          <section className="card">
            <h2>Usuários</h2>
            {users.length === 0 ? <p className="muted">Nenhum usuário cadastrado.</p> : (
              <ul className="list">
                {users.map((u) => (
                  <li key={u.id} className="item" style={{ display: 'block' }}>
                    <details>
                      <summary>
                        {u.name} ({u.username}), {ROLE_LABEL[u.role]} {!u.is_active && <span className="badge badge-inativo">Inativo</span>}
                      </summary>
                      <ActionForm action={saveUser} submitLabel="Salvar usuário">
                        <input type="hidden" name="id" value={u.id} />
                        <div className="fields">
                          <label>Nome *<input name="name" required maxLength={80} defaultValue={u.name} /></label>
                          <label>Usuário *<input name="username" required maxLength={40} defaultValue={u.username} autoCapitalize="none" /></label>
                          <label>Perfil<RoleSelect value={u.role} /></label>
                          <label>Nova senha<input name="password" type="password" minLength={8} autoComplete="new-password" placeholder="deixe vazio para manter" /></label>
                        </div>
                      </ActionForm>
                      <form action={setUserActive} style={{ marginTop: '.5rem' }}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="active" value={u.is_active ? '0' : '1'} />
                        {u.is_active ? (
                          <ConfirmButton className="btn btn-sm btn-danger" message={`Desativar o acesso de ${u.name}?`}>Desativar acesso</ConfirmButton>
                        ) : (
                          <button className="btn btn-sm" type="submit">Reativar acesso</button>
                        )}
                      </form>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2>Novo usuário</h2>
            <ActionForm action={saveUser} submitLabel="Criar usuário">
              <div className="fields">
                <label>Nome *<input name="name" required maxLength={80} /></label>
                <label>Usuário *<input name="username" required maxLength={40} autoCapitalize="none" autoComplete="off" /></label>
                <label>Perfil<RoleSelect /></label>
                <label>Senha * (mín. 8)<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
              </div>
            </ActionForm>
          </section>
        </>
      ) : (
        <p className="alert alert-warn">Somente administradores gerenciam usuários.</p>
      )}
    </>
  );
}
