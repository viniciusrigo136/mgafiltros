import type { Metadata } from 'next';
import Link from 'next/link';
import { listOwners } from '@/lib/data';
import { formatPhone } from '@/lib/format';
import { Empty, Flash, PageHead, one, type SearchParams } from '@/components/ui';

export const metadata: Metadata = { title: 'Proprietários' };

export default async function Proprietarios({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const inativos = one(sp.inativos) === '1';
  const owners = await listOwners({ q, includeInactive: inativos });
  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <PageHead title="Proprietários">
        <Link className="btn btn-primary" href="/proprietarios/novo">+ Novo proprietário</Link>
      </PageHead>
      <form className="toolbar" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Buscar por nome, município ou telefone" aria-label="Buscar proprietário" />
        <label className="check"><input type="checkbox" name="inativos" value="1" defaultChecked={inativos} /> Incluir inativos</label>
        <button className="btn" type="submit">Buscar</button>
      </form>
      {owners.length === 0 ? (
        <Empty>
          {q ? 'Nenhum proprietário encontrado.' : <>Nenhum proprietário cadastrado. <Link href="/proprietarios/novo">Cadastrar</Link>.</>}
        </Empty>
      ) : (
        <ul className="list">
          {owners.map((o) => (
            <li key={o.id}>
              <Link href={`/proprietarios/${o.id}`} className="item">
                <span className="item-body">
                  <span className="item-title">{o.name}</span>
                  <span className="item-sub">
                    {[o.city, formatPhone(o.phone)].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
                  </span>
                </span>
                {!o.is_active && <span className="badge badge-inativo">Inativo</span>}
                <span className="muted">{o.tractor_count} {o.tractor_count === 1 ? 'trator' : 'tratores'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
