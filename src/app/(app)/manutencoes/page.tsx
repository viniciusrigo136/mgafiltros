import type { Metadata } from 'next';
import Link from 'next/link';
import { listOilChanges } from '@/lib/data';
import { listMaintenanceTypes, listPlans, listRecords } from '@/lib/maintenance';
import { compareUrgency } from '@/lib/status';
import { formatDate, formatHours, formatNumber } from '@/lib/format';
import { OilChangeList } from '@/components/OilChangeList';
import { Empty, Flash, PageHead, StatusBadge, Tabs, one, statusReason, type SearchParams } from '@/components/ui';

export const metadata: Metadata = { title: 'Manutenções' };

export default async function Manutencoes({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const aba = one(sp.aba) === 'outras' ? 'outras' : 'oleo';
  const tabs = [
    { key: 'oleo', label: 'Trocas de óleo', href: `/manutencoes${q ? `?q=${encodeURIComponent(q)}` : ''}` },
    { key: 'outras', label: 'Outras manutenções', href: `/manutencoes?aba=outras${q ? `&q=${encodeURIComponent(q)}` : ''}` },
  ];

  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <PageHead title="Manutenções">
        <Link className="btn btn-primary" href="/manutencoes/nova">+ Registrar troca de óleo</Link>
      </PageHead>
      <Tabs items={tabs} active={aba} />
      <form className="toolbar" role="search">
        {aba === 'outras' && <input type="hidden" name="aba" value="outras" />}
        <input type="search" name="q" defaultValue={q} placeholder="Nº do trator, proprietário, marca, modelo ou produto" aria-label="Buscar no histórico" />
        <button className="btn" type="submit">Buscar</button>
      </form>
      {aba === 'oleo' ? <OilTab q={q} /> : <OtherTab q={q} typeId={Number(one(sp.tipo)) || undefined} />}
    </>
  );
}

function OilTab({ q }: { q: string }) {
  const changes = listOilChanges({ q, limit: 200 });
  return (
    <section className="card">
      <OilChangeList changes={changes} showTractor />
      {changes.length === 200 && <p className="muted">Mostrando as 200 mais recentes. Refine a busca para ver outras.</p>}
    </section>
  );
}

function OtherTab({ q, typeId }: { q: string; typeId?: number }) {
  const plans = listPlans({ activeOnly: true })
    .filter((p) => p.st.status !== 'em_dia' && (!typeId || p.type_id === typeId))
    .sort((a, b) => compareUrgency(a.st, b.st));
  const records = listRecords({ q, typeId, limit: 200 });
  const types = listMaintenanceTypes();
  return (
    <>
      <div className="toolbar">
        <span className="muted">Tipo:</span>
        <Link className={`btn btn-sm${!typeId ? ' btn-dark' : ''}`} href="/manutencoes?aba=outras">Todos</Link>
        {types.map((t) => (
          <Link key={t.id} className={`btn btn-sm${typeId === t.id ? ' btn-dark' : ''}`} href={`/manutencoes?aba=outras&tipo=${t.id}`}>{t.name}</Link>
        ))}
      </div>
      <section className="card">
        <h2>Planos que pedem atenção</h2>
        {plans.length === 0 ? (
          <p className="muted">Nada vencido, próximo ou sem dados. Configure planos na ficha de cada trator.</p>
        ) : (
          <ul className="list">
            {plans.map((p) => (
              <li key={p.id}>
                <Link className="item" href={`/tratores/${p.tractor_id}#outras`}>
                  <span className="plate">{p.sequential_number}</span>
                  <span className="item-body">
                    <span className="item-title">{p.type_name}, {p.brand} {p.model}</span>
                    <span className="item-sub">{p.owner_name}. {statusReason(p.st)}</span>
                  </span>
                  <StatusBadge status={p.st.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2>Serviços realizados</h2>
        {records.length === 0 ? (
          <Empty>Nenhum serviço registrado. Registre pela ficha do trator, em “Outras manutenções”.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Trator</th><th>Tipo</th><th className="num">Horímetro</th><th>Produto</th><th>Resp.</th></tr></thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.serviced_at)}</td>
                    <td><Link href={`/tratores/${r.tractor_id}`}>Nº {r.sequential_number}</Link> <span className="item-sub">{r.owner_name}</span></td>
                    <td>{r.type_name}</td>
                    <td className="num">{formatHours(r.service_hours)}</td>
                    <td>{[r.product_used, r.quantity != null ? formatNumber(r.quantity) : null].filter(Boolean).join(' × ') || '—'}</td>
                    <td>{r.performed_by ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
