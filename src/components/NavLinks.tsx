'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Painel' },
  { href: '/proprietarios', label: 'Proprietários' },
  { href: '/tratores', label: 'Tratores' },
  { href: '/manutencoes', label: 'Manutenções' },
  { href: '/catalogo', label: 'Catálogo' },
  { href: '/ordens', label: 'Ordens de serviço' },
  { href: '/estoque', label: 'Estoque' },
  { href: '/relatorios', label: 'Relatórios' },
  { href: '/configuracoes', label: 'Configurações' },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Principal">
      {LINKS.map((l) => {
        const active = l.href === '/' ? path === '/' : path.startsWith(l.href) || (l.href === '/configuracoes' && path.startsWith('/modelos'));
        return (
          <Link key={l.href} href={l.href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
