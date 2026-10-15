import type { Metadata } from 'next';
import Link from 'next/link';
import { STOCK_KINDS, STOCK_KIND_LABEL, listStock } from '@/lib/stock';
import { formatNumber } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { Empty, Flash, PageHead, one, type SearchParams } from '@/components/ui';

export const metadata: Metadata = { title: 'Estoque' };

export default async function Estoque({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const kind = one(sp.tipo);
  const low = one(sp.baixo) === '1';
  const inativos = one(sp.inativos) === '1';
  const items = await listStock({ q, kind, low, includeInactive: inativos });
  const value = items.reduce((s, i) => s + Math.max(0, i.balance) * (i.cost_price ?? 0), 0);

  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <PageHead title="Estoque">
        <a className="btn" href="/exportar/estoque" download>Exportar CSV</a>
        <Link className="btn btn-primary" href="/estoque/novo">+ Novo item</Link>
      </PageHead>
      <form className="toolbar" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Código, descrição, fabricante ou local" aria-label="Buscar no estoque" />
        <select name="tipo" defaultValue={kind} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {STOCK_KINDS.map((k) => <option key={k} value={k}>{STOCK_KIND_LABEL[k]}</option>)}
        </select>
        <label className="check"><input type="checkbox" name="baixo" value="1" defaultChecked={low} /> Só estoque baixo</label>
        <label className="check"><input type="checkbox" name="inativos" value="1" defaultChecked={inativos} /> Inativos</label>
        <button className="btn" type="submit">Filtrar</button>
      </form>
      {items.length === 0 ? (
        <Empty>{q || kind || low ? 'Nenhum item encontrado.' : <>Estoque vazio. <Link href="/estoque/novo">Cadastrar o primeiro item</Link>.</>}</Empty>
      ) : (
        <section className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Código</th><th>Descrição</th><th>Tipo</th><th>Local</th><th className="num">Saldo</th><th className="num">Mínimo</th><th className="num">Venda</th></tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const isLow = i.balance <= i.min_quantity && (i.min_quantity > 0 || i.balance <= 0);
                  return (
                    <tr key={i.id}>
                      <td><Link href={`/estoque/${i.id}`}><strong>{i.reference_code}</strong></Link>{!i.is_active && <span className="badge badge-inativo"> inativo</span>}</td>
                      <td>{i.description ?? '—'}{i.manufacturer ? <span className="item-sub">{i.manufacturer}</span> : null}</td>
                      <td>{STOCK_KIND_LABEL[i.kind]}</td>
                      <td>{i.location ?? '—'}</td>
                      <td className={`num ${isLow ? 'bad-text' : ''}`}>{formatNumber(i.balance)} {i.unit}</td>
                      <td className="num">{formatNumber(i.min_quantity)}</td>
                      <td className="num">{formatMoney(i.sale_price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted">{items.length} itens. Valor em estoque (custo): {formatMoney(value)}.</p>
        </section>
      )}
    </>
  );
}
