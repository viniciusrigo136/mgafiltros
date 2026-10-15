import type { Metadata } from 'next';
import Link from 'next/link';
import { WO_STATUSES, WO_STATUS_LABEL, listOrders } from '@/lib/orders';
import { formatDate } from '@/lib/format';
import { formatMoney, orderTotals } from '@/lib/money';
import { Empty, Flash, OrderBadge, PageHead, one, type SearchParams } from '@/components/ui';

export const metadata: Metadata = { title: 'Ordens de serviço' };

export default async function Ordens({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const status = one(sp.situacao);
  const abertas = one(sp.abertas) === '1';
  const orders = await listOrders({ q, status, open: abertas && !status });

  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <PageHead title="Ordens de serviço">
        <Link className="btn btn-primary" href="/ordens/nova">+ Abrir OS</Link>
      </PageHead>
      <form className="toolbar" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Nº da OS ou do trator, proprietário, marca…" aria-label="Buscar OS" />
        <select name="situacao" defaultValue={status} aria-label="Situação">
          <option value="">Todas as situações</option>
          {WO_STATUSES.map((s) => <option key={s} value={s}>{WO_STATUS_LABEL[s]}</option>)}
        </select>
        <label className="check"><input type="checkbox" name="abertas" value="1" defaultChecked={abertas} /> Só abertas</label>
        <button className="btn" type="submit">Filtrar</button>
      </form>
      {orders.length === 0 ? (
        <Empty>{q || status || abertas ? 'Nenhuma OS encontrada.' : <>Nenhuma OS ainda. <Link href="/ordens/nova">Abrir a primeira</Link>.</>}</Empty>
      ) : (
        <ul className="list">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/ordens/${o.id}`} className="item">
                <span className="plate">{o.sequential_number}</span>
                <span className="item-body">
                  <span className="item-title">OS {o.number}: {o.brand} {o.model}, {o.owner_name}</span>
                  <span className="item-sub">Aberta em {formatDate(o.opened_at)}{o.closed_at ? `, concluída em ${formatDate(o.closed_at)}` : ''}. {o.complaint ?? ''}</span>
                </span>
                <span className="item-side">
                  <OrderBadge status={o.status} />
                  <strong>{formatMoney(orderTotals([{ kind: 'peca', quantity: 1, unit_price: o.gross }], o.discount).total)}</strong>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
