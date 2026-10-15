import type { Metadata } from 'next';
import { login } from '@/lib/actions';
import { ActionForm } from '@/components/ActionForm';
import { Brand } from '@/components/ui';

export const metadata: Metadata = { title: 'Entrar' };

export default function LoginPage() {
  return (
    <div className="login">
      <div className="login-card">
        <Brand large />
        <ActionForm action={login} submitLabel="Entrar">
          <div className="fields">
            <label>Usuário
              <input name="username" autoComplete="username" autoCapitalize="none" required autoFocus />
            </label>
            <label>Senha
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
          </div>
        </ActionForm>
        <p className="muted">Acesso restrito à equipe da oficina.</p>
      </div>
    </div>
  );
}
