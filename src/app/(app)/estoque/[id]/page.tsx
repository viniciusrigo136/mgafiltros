import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStockItem, listMovements, STOCK_KIND_LABEL } from '@/lib/stock';
import { moveStock, setStockItemActive } from '@/lib/actions-stock';
import { canEdit, requireUser } from '@/lib/auth';
import { formatNumber } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { ActionForm } from '@/components/ActionForm';
import { ConfirmButton } from '@/components/ConfirmButton';
import { StockForm } from '@/components/StockForm';
import { Flash, PageHead, one, type SearchParams } from '@/components/ui';

export default async function ItemEstoque({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const item = getStockItem(Number(id));
  if (!item) notFound();
  const movements = listMovements(item.id);
  const editable = canEdit(user);
  const isLow = item.min_quantity > 0 && item.balance <= item.min_quantity;

  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <PageHead title={<>{item.reference_code} {!item.is_active && <span className="badge badge-inativo">Inativo</span>}</>} back={{ href: '/estoque', label: 'Estoque' }} />
      <div className="big-figures">
        <div className={`fig ${isLow || item.balance < 0 ? 'bad' : ''}`}><span>Saldo</span><strong>{formatNumber(item.balance)} {item.unit}</strong></div>
        <div className="fig"><span>Mínimo</span><strong>{formatNumber(item.min_quantity)} {item.unit}</strong></div>
        <div className="fig"><span>Tipo</span><strong>{STOCK_KIND_LABEL[item.kind]}</strong></div>
        <div className="fig"><span>Venda</span><strong>{formatMoney(item.sale_price)}</strong></div>
      </div>
      {item.balance < 0 && <p className="alert alert-error">Saldo negativo: houve baixa sem entrada registrada. Faça um inventário para corrigir.</p>}

      <div className="grid grid-2">
        {editable && (
          <section className="card">
            <h2>Movimentar</h2>
            <ActionForm action={moveStock} submitLabel="Registrar movimentação">
              <input type="hidden" name="item_id" value={item.id} />
              <div className="fields">
                <label>Tipo
                  <select name="type" defaultValue="entrada">
                    <option value="entrada">Entrada (compra)</option>
                    <option value="saida">Saída avulsa</option>
                    <option value="inventario">Inventário (saldo contado)</option>
                  </select>
                </label>
                <label>Quantidade *<input name="quantity" inputMode="decimal" required /></label>
                <label className="span-2">Motivo / nota fiscal<input name="reason" maxLength={200} /></label>
              </div>
            </ActionForm>
          </section>
        )}
        <section className="card">
          <h2>Movimentações</h2>
          {movements.length === 0 ? (
            <p className="muted">Nenhuma movimentação.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Data</th><th>Motivo</th><th className="num">Qtd.</th></tr></thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td>{m.created_at.slice(0, 10).split('-').reverse().join('/')}</td>
                      <td>
                        {m.reason}
                        {m.work_order_id ? <> (<Link href={`/ordens/${m.work_order_id}`}>OS {m.work_order_number}</Link>)</> : null}
                        {m.oil_change_id && m.tractor_id ? <> (<Link href={`/tratores/${m.tractor_id}#historico`}>ver trator</Link>)</> : null}
                      </td>
                      <td className={`num ${m.delta < 0 ? 'bad-text' : 'ok-text'}`}>{m.delta > 0 ? '+' : ''}{formatNumber(m.delta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {editable && (
        <section className="card">
          <h2>Cadastro</h2>
          <StockForm item={item} />
          <form action={setStockItemActive} style={{ marginTop: '1rem' }}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="active" value={item.is_active ? '0' : '1'} />
            {item.is_active ? (
              <ConfirmButton className="btn btn-danger" message="Inativar este item? Ele deixa de ser usado nas baixas automáticas.">Inativar item</ConfirmButton>
            ) : (
              <button className="btn" type="submit">Reativar item</button>
            )}
          </form>
        </section>
      )}
    </>
  );
}
