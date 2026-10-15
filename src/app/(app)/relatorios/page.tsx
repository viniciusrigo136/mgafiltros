import type { Metadata } from 'next';
import Link from 'next/link';
import { periodReport } from '@/lib/reports';
import { dashboard } from '@/lib/data';
import { filterTypeLabel, formatDate, formatNumber } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { addMonths, isValidIsoDate, todayInTimeZone } from '@/lib/status';
import { Empty, PageHead, StatusBadge, one, statusReason, type SearchParams } from '@/components/ui';

export const metadata: Metadata = { title: 'Relatórios' };

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5)) - 1]}/${ym.slice(2, 4)}`;

export default async function Relatorios({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const today = todayInTimeZone();
  const rawFrom = one(sp.de);
  const rawTo = one(sp.ate);
  const to = isValidIsoDate(rawTo) ? rawTo : today;
  const from = isValidIsoDate(rawFrom) && rawFrom <= to ? rawFrom : `${addMonths(to, -11).slice(0, 7)}-01`;
  const r = periodReport(from, to);
  const overdue = dashboard().attention.filter((t) => t.st.status === 'vencida');
  const maxMonth = Math.max(1, ...r.byMonth.map((m) => m.oil + m.other));

  return (
    <>
      <PageHead title="Relatórios">
        <a className="btn" href="/backup" download>Baixar backup do banco</a>
      </PageHead>
      <form className="toolbar card">
        <label>De<input type="date" name="de" defaultValue={from} max={today} /></label>
        <label>Até<input type="date" name="ate" defaultValue={to} max={today} /></label>
        <button className="btn" type="submit" style={{ alignSelf: 'flex-end' }}>Aplicar período</button>
        <span className="muted" style={{ alignSelf: 'flex-end' }}>{formatDate(from)} a {formatDate(to)}</span>
      </form>

      <div className="stats">
        <div className="stat stat-sem_dados"><strong>{r.oilChanges}</strong><span>Trocas de óleo</span></div>
        <div className="stat stat-sem_dados"><strong>{r.otherServices}</strong><span>Outros serviços</span></div>
        <div className="stat stat-sem_dados"><strong>{r.ordersClosed}</strong><span>OS concluídas (de {r.ordersOpened} abertas)</span></div>
        <div className="stat stat-em_dia"><strong style={{ fontSize: '1.9rem' }}>{formatMoney(r.revenue)}</strong><span>Faturado em OS</span></div>
      </div>

      <section className="card">
        <h2>Serviços por mês</h2>
        <div className="legend" aria-hidden="true">
          <span><i className="bar-oil" />Trocas de óleo</span>
          <span><i className="bar-other" />Outros serviços</span>
        </div>
        {r.byMonth.every((m) => m.oil + m.other === 0) ? (
          <p className="muted">Nenhum serviço no período.</p>
        ) : (
          <div className="bars" role="img" aria-label="Serviços por mês; os valores estão na tabela abaixo">
            {r.byMonth.map((m) => (
              <div className="bar-row" key={m.month} title={`${monthLabel(m.month)}: ${m.oil} trocas de óleo, ${m.other} outros serviços, ${formatMoney(m.revenue)} em OS`}>
                <span>{monthLabel(m.month)}</span>
                <span className="bar-track">
                  {m.oil > 0 && <span className="bar-oil" style={{ width: `${(m.oil / maxMonth) * 100}%` }} />}
                  {m.other > 0 && <span className="bar-other" style={{ width: `${(m.other / maxMonth) * 100}%` }} />}
                </span>
                <span className="muted">{m.oil + m.other} serviços</span>
              </div>
            ))}
          </div>
        )}
        <details>
          <summary>Ver como tabela</summary>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Mês</th><th className="num">Trocas de óleo</th><th className="num">Outros serviços</th><th className="num">Faturado em OS</th></tr></thead>
              <tbody>
                {r.byMonth.map((m) => (
                  <tr key={m.month}><td>{monthLabel(m.month)}</td><td className="num">{m.oil}</td><td className="num">{m.other}</td><td className="num">{formatMoney(m.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <div className="grid grid-3">
        <section className="card">
          <h2>Filtros mais trocados</h2>
          {r.topFilters.length === 0 ? <p className="muted">Sem dados no período.</p> : (
            <table>
              <tbody>
                {r.topFilters.map((f) => (
                  <tr key={f.code}><td><strong>{f.code}</strong><span className="item-sub">{filterTypeLabel(f.type)}</span></td><td className="num">{formatNumber(f.qty)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h2>Peças vendidas em OS</h2>
          {r.topParts.length === 0 ? <p className="muted">Sem dados no período.</p> : (
            <table>
              <tbody>
                {r.topParts.map((p, i) => (
                  <tr key={i}><td>{p.description}<span className="item-sub">{p.code ?? ''}</span></td><td className="num">{formatNumber(p.qty)}<span className="item-sub">{formatMoney(p.value)}</span></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h2>Clientes com mais serviços</h2>
          {r.topOwners.length === 0 ? <p className="muted">Sem dados no período.</p> : (
            <table>
              <tbody>
                {r.topOwners.map((o) => (
                  <tr key={o.id}><td><Link href={`/proprietarios/${o.id}`}>{o.name}</Link></td><td className="num">{o.services}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Trocas de óleo vencidas agora ({overdue.length})</h2>
        {overdue.length === 0 ? <Empty>Nenhum trator com troca vencida.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nº</th><th>Trator</th><th>Proprietário</th><th>Motivo</th><th></th></tr></thead>
              <tbody>
                {overdue.map((t) => (
                  <tr key={t.id}>
                    <td><Link href={`/tratores/${t.id}`}><strong>{t.sequential_number}</strong></Link></td>
                    <td>{t.brand} {t.model}</td>
                    <td>{t.owner_name}</td>
                    <td>{statusReason(t.st)}</td>
                    <td><StatusBadge status={t.st.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Exportar planilhas (CSV para Excel)</h2>
        <div className="inline-forms">
          <a className="btn btn-sm" href="/exportar/proprietarios" download>Proprietários</a>
          <a className="btn btn-sm" href="/exportar/tratores" download>Tratores e situação</a>
          <a className="btn btn-sm" href="/exportar/trocas" download>Trocas de óleo</a>
          <a className="btn btn-sm" href="/exportar/servicos" download>Outros serviços</a>
          <a className="btn btn-sm" href="/exportar/ordens" download>Ordens de serviço</a>
          <a className="btn btn-sm" href="/exportar/estoque" download>Estoque</a>
        </div>
      </section>
    </>
  );
}
