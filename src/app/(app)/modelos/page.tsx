import type { Metadata } from 'next';
import Link from 'next/link';
import { listModels } from '@/lib/models';
import { formatNumber } from '@/lib/format';
import { Empty, Flash, PageHead, one, type SearchParams } from '@/components/ui';

export const metadata: Metadata = { title: 'Modelos de trator' };

export default async function Modelos({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const models = await listModels(q);
  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <PageHead title="Modelos de trator" back={{ href: '/configuracoes', label: 'Configurações' }}>
        <Link className="btn btn-primary" href="/modelos/novo">+ Novo modelo</Link>
      </PageHead>
      <p className="muted">Modelos guardam óleo, intervalos e filtros já revisados pela oficina, para preencher o cadastro de novos tratores. Também dá para criar um modelo pela ficha de um trator.</p>
      <form className="toolbar" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Marca ou modelo" aria-label="Buscar modelo" />
        <button className="btn" type="submit">Buscar</button>
      </form>
      {models.length === 0 ? (
        <Empty>Nenhum modelo cadastrado.</Empty>
      ) : (
        <ul className="list">
          {models.map((m) => (
            <li key={m.id}>
              <Link href={`/modelos/${m.id}`} className="item">
                <span className="item-body">
                  <span className="item-title">{m.brand} {m.model}</span>
                  <span className="item-sub">
                    {[m.oil_spec, m.oil_capacity_liters && `${formatNumber(m.oil_capacity_liters)} L`,
                      m.interval_hours && `${formatNumber(m.interval_hours)} h`, m.interval_months && `${m.interval_months} meses`,
                      `${m.filter_count} filtros`].filter(Boolean).join(', ')}
                  </span>
                </span>
                <span className="muted">{m.tractor_count} {m.tractor_count === 1 ? 'trator' : 'tratores'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
