import Link from 'next/link';
import { dashboard } from '@/lib/data';
import { planAlerts } from '@/lib/maintenance';
import { lowStockCount } from '@/lib/stock';
import { openOrdersCount } from '@/lib/orders';
import { getSettings } from '@/lib/settings';
import { formatDate, formatHours } from '@/lib/format';
import { STATUS_LABEL, addDays, todayInTimeZone, type MaintenanceStatus } from '@/lib/status';
import { Empty, Flash, NotifyLink, ReadingInfo, StatusBadge, one, statusReason, type SearchParams } from '@/components/ui';

const ORDER: MaintenanceStatus[] = ['vencida', 'proxima', 'em_dia', 'sem_dados'];

export default async function Painel({ searchParams }: { searchParams: SearchParams }) {
  const [sp, { counts, attention, total, upcoming }, plans, settings, lowStock, openOrders] = await Promise.all([
    searchParams, dashboard(), planAlerts(), getSettings(), lowStockCount(), openOrdersCount(),
  ]);
  const notFound = one(sp.nao_encontrado);
  const horizon = addDays(todayInTimeZone(), 30);

  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      {notFound && <p className="alert alert-warn">Nenhum trator com o nº {notFound}.</p>}

      <div className="grid grid-3-1">
        <section className="card">
          <h2>Consultar trator</h2>
          <form action="/buscar" className="search-big" role="search">
            <input name="q" type="search" inputMode="numeric" placeholder="Nº do trator (ex.: 35)" aria-label="Número do trator" autoFocus />
            <button className="btn btn-primary" type="submit">Abrir ficha</button>
          </form>
          <p className="muted">Digite só o número. Texto busca por proprietário, marca, modelo ou código de filtro.</p>
        </section>
        <section className="card">
          <h2>Atalhos</h2>
          <div className="shortcuts">
            <Link className="btn btn-primary" href="/manutencoes/nova">Registrar troca</Link>
            <Link className="btn" href="/ordens/nova">Abrir OS</Link>
            <Link className="btn" href="/tratores/novo">Novo trator</Link>
            <Link className="btn" href="/proprietarios/novo">Novo proprietário</Link>
          </div>
        </section>
      </div>

      <div className="stats">
        {ORDER.map((s) => (
          <Link key={s} href={`/tratores?situacao=${s}`} className={`stat stat-${s}`}>
            <strong>{counts[s]}</strong>
            <span>{STATUS_LABEL[s]}</span>
          </Link>
        ))}
      </div>
      <div className="mini-stats">
        <Link href="/ordens?abertas=1"><strong>{openOrders}</strong> {openOrders === 1 ? 'ordem de serviço aberta' : 'ordens de serviço abertas'}</Link>
        <Link href="/estoque?baixo=1" className={lowStock ? 'bad-text' : undefined}>
          <strong>{lowStock}</strong> {lowStock === 1 ? 'item com estoque baixo' : 'itens com estoque baixo'}
        </Link>
        <Link href="/manutencoes?aba=outras"><strong>{plans.length}</strong> outras manutenções pedindo atenção</Link>
      </div>

      <div className="grid grid-3-1">
        <section>
          <h2>Troca de óleo: exigem atenção</h2>
          {total === 0 ? (
            <Empty>Nenhum trator cadastrado. <Link href="/tratores/novo">Cadastre o primeiro trator</Link>.</Empty>
          ) : attention.length === 0 ? (
            <Empty>Todos os {total} tratores ativos estão em dia.</Empty>
          ) : (
            <ul className="list">
              {attention.map((t) => (
                <li key={t.id} className="item">
                  <Link href={`/tratores/${t.id}`} className="plate" aria-label={`Abrir trator ${t.sequential_number}`}>{t.sequential_number}</Link>
                  <Link href={`/tratores/${t.id}`} className="item-body" style={{ textDecoration: 'none' }}>
                    <span className="item-title">{t.brand} {t.model}, {t.owner_name}</span>
                    <span className="item-sub">{statusReason(t.st)}</span>
                    <span className="item-sub">
                      Horímetro {formatHours(t.current_hours)}, <ReadingInfo st={t.st} readAt={t.hours_read_at} staleDays={settings.thresholds.staleReadingDays} />
                    </span>
                  </Link>
                  <span className="item-side">
                    <StatusBadge status={t.st.status} />
                    {t.st.status !== 'sem_dados' && (
                      <NotifyLink
                        className="btn btn-sm btn-wa"
                        phone={t.owner_phone}
                        settings={settings}
                        vars={{ cliente: t.owner_name, numero: t.sequential_number, trator: `${t.brand} ${t.model}`, situacao: STATUS_LABEL[t.st.status].toLowerCase(), motivo: statusReason(t.st) }}
                      />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div>
          <section className="card">
            <h2>Previsão para 30 dias</h2>
            <p className="hint">Pelo uso médio de cada trator (horas/dia) ou pela data limite.</p>
            {upcoming.filter((u) => u.date <= horizon).length === 0 ? (
              <p className="muted">Nenhuma troca prevista até {formatDate(horizon)}.</p>
            ) : (
              <ul className="list">
                {upcoming.filter((u) => u.date <= horizon).map((u) => (
                  <li key={u.t.id}>
                    <Link href={`/tratores/${u.t.id}`} className="item">
                      <span className="plate">{u.t.sequential_number}</span>
                      <span className="item-body">
                        <span className="item-title">{formatDate(u.date)}</span>
                        <span className="item-sub">{u.t.owner_name}, {u.basis}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2>Outras manutenções</h2>
            {plans.length === 0 ? (
              <p className="muted">Nenhum plano vencido ou próximo.</p>
            ) : (
              <ul className="list">
                {plans.slice(0, 8).map((p) => (
                  <li key={p.id}>
                    <Link href={`/tratores/${p.tractor_id}#outras`} className="item">
                      <span className="plate">{p.sequential_number}</span>
                      <span className="item-body">
                        <span className="item-title">{p.type_name}</span>
                        <span className="item-sub">{statusReason(p.st)}</span>
                      </span>
                      <StatusBadge status={p.st.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
