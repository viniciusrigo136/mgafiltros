import Link from 'next/link';
import { loginEnabled, requireUser } from '@/lib/auth';
import { logout } from '@/lib/actions';
import { NavLinks } from '@/components/NavLinks';
import { ServiceWorker } from '@/components/ServiceWorker';
import { Brand } from '@/components/ui';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" aria-label="Painel" className="brand-link">
            <Brand />
          </Link>
          <NavLinks />
          <form action="/buscar" className="quick" role="search">
            <input name="q" type="search" inputMode="numeric" placeholder="Nº trator" aria-label="Buscar trator pelo número" />
            <button className="btn btn-primary" type="submit">Ir</button>
          </form>
          {loginEnabled ? (
            <form action={logout} className="user">
              <span>{user.name}</span>
              <button className="btn btn-sm" type="submit">Sair</button>
            </form>
          ) : null}
        </div>
      </header>
      <main>{children}</main>
      <ServiceWorker />
    </>
  );
}
