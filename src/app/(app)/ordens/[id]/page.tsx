import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  addChecklistItem, addOrderItem, deleteOrder, removeOrderItem, saveOrderHeader, setOrderStatus, toggleChecklist,
} from '@/lib/actions-orders';
import { WO_STATUS_LABEL, getOrder, type WoStatus } from '@/lib/orders';
import { listStock } from '@/lib/stock';
import { listAttachments } from '@/lib/attachments';
import { canEdit, requireUser } from '@/lib/auth';
import { formatDate, formatHours, formatNumber } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { todayInTimeZone } from '@/lib/status';
import { ActionForm } from '@/components/ActionForm';
import { Attachments } from '@/components/Attachments';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Flash, OrderBadge, one, type SearchParams } from '@/components/ui';

const NEXT_STEPS: Record<WoStatus, WoStatus[]> = {
  orcamento: ['aprovada', 'cancelada'],
  aprovada: ['em_execucao', 'concluida', 'cancelada'],
  em_execucao: ['concluida', 'cancelada'],
  concluida: ['em_execucao'],
  cancelada: ['orcamento'],
};
const STEP_LABEL: Partial<Record<WoStatus, string>> = {
  aprovada: 'Cliente aprovou', em_execucao: 'Iniciar execução', concluida: 'Concluir OS', cancelada: 'Cancelar', orcamento: 'Voltar a orçamento',
};

export default async function Ordem({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const data = getOrder(Number(id));
  if (!data) notFound();
  const { order: o, items, checklist, totals } = data;
  const editable = canEdit(user) && o.status !== 'cancelada';
  const stock = editable ? listStock() : [];
  const attachments = listAttachments({ workOrderId: o.id });
  const reverting = o.status === 'concluida';

  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <Link href="/ordens" className="back">← Ordens de serviço</Link>
      <div className="page-head">
        <div className="hero">
          <Link href={`/tratores/${o.tractor_id}`} className="plate" aria-label={`Trator ${o.sequential_number}`}>{o.sequential_number}</Link>
          <div>
            <h1>OS {o.number} <OrderBadge status={o.status} /></h1>
            <div><strong>{o.brand} {o.model}</strong>, <Link href={`/proprietarios/${o.owner_id}`}>{o.owner_name}</Link></div>
            <div className="muted">Aberta em {formatDate(o.opened_at)}{o.closed_at ? `, concluída em ${formatDate(o.closed_at)}` : ''}</div>
          </div>
        </div>
        <div className="page-actions">
          <Link className="btn btn-dark" href={`/ordens/${o.id}/imprimir`}>{o.status === 'orcamento' ? 'Imprimir orçamento' : 'Imprimir OS'}</Link>
          {canEdit(user) && (o.status === 'em_execucao' || o.status === 'concluida') && (
            <Link className="btn" href={`/manutencoes/nova?trator=${o.tractor_id}&os=${o.id}`}>Registrar troca de óleo desta OS</Link>
          )}
        </div>
      </div>

      {canEdit(user) && (
        <div className="inline-forms" style={{ marginBottom: '1rem' }}>
          <span className="muted">Mudar situação:</span>
          {NEXT_STEPS[o.status].map((s) => (
            <form action={setOrderStatus} key={s}>
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="status" value={s} />
              <ConfirmButton
                className={`btn btn-sm${s === 'concluida' ? ' btn-primary' : s === 'cancelada' ? ' btn-danger' : ''}`}
                message={
                  s === 'concluida' ? 'Concluir a OS? As peças vinculadas ao estoque serão baixadas.'
                    : reverting ? `Reabrir como "${WO_STATUS_LABEL[s]}"? As peças baixadas voltam ao estoque.`
                      : `Mudar para "${WO_STATUS_LABEL[s]}"?`
                }
              >
                {STEP_LABEL[s] ?? WO_STATUS_LABEL[s]}
              </ConfirmButton>
            </form>
          ))}
        </div>
      )}

      <section className="card" id="itens">
        <h2>Peças e serviços</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Tipo</th><th>Descrição</th><th>Código</th><th className="num">Qtd.</th><th className="num">Unitário</th><th className="num">Total</th><th></th></tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={7} className="muted">Nenhum item lançado.</td></tr>}
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.kind === 'servico' ? 'Serviço' : 'Peça'}</td>
                  <td>
                    {i.description}
                    {i.kind === 'peca' && (
                      <span className="item-sub">
                        {i.stock_item_id ? (i.deducted ? 'baixado do estoque' : 'do estoque, baixa ao concluir') : 'sem vínculo com estoque'}
                      </span>
                    )}
                  </td>
                  <td>{i.reference_code ?? '—'}</td>
                  <td className="num">{formatNumber(i.quantity)}</td>
                  <td className="num">{formatMoney(i.unit_price)}</td>
                  <td className="num">{formatMoney(i.quantity * i.unit_price)}</td>
                  <td>
                    {editable && (
                      <form action={removeOrderItem}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="work_order_id" value={o.id} />
                        <ConfirmButton className="btn btn-sm btn-ghost" message="Remover este item?">Remover</ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={5}>Peças</td><td className="num">{formatMoney(totals.parts)}</td><td></td></tr>
              <tr><td colSpan={5}>Mão de obra</td><td className="num">{formatMoney(totals.labor)}</td><td></td></tr>
              {totals.discount > 0 && <tr><td colSpan={5}>Desconto</td><td className="num">−{formatMoney(totals.discount)}</td><td></td></tr>}
              <tr><td colSpan={5} style={{ fontSize: '1.1rem' }}>Total</td><td className="num" style={{ fontSize: '1.1rem' }}>{formatMoney(totals.total)}</td><td></td></tr>
            </tfoot>
          </table>
        </div>
        {editable && (
          <details open={items.length === 0}>
            <summary>Adicionar peça ou serviço</summary>
            <ActionForm action={addOrderItem} submitLabel="Adicionar">
              <input type="hidden" name="work_order_id" value={o.id} />
              <div className="fields">
                <label>Tipo
                  <select name="kind" defaultValue="peca">
                    <option value="peca">Peça / produto</option>
                    <option value="servico">Serviço / mão de obra</option>
                  </select>
                </label>
                <label>Código (estoque)
                  <input name="reference_code" list="stock-codes" maxLength={80} placeholder="preenche descrição e preço" />
                  <datalist id="stock-codes">
                    {stock.map((s) => <option key={s.id} value={s.reference_code}>{s.description ?? ''} (saldo {formatNumber(s.balance)})</option>)}
                  </datalist>
                </label>
                <label className="span-2">Descrição<input name="description" maxLength={200} /></label>
                <label>Quantidade *<input name="quantity" inputMode="decimal" required defaultValue="1" /></label>
                <label>Valor unitário (R$)<input name="unit_price" inputMode="decimal" placeholder="preço do estoque, se vazio" /></label>
              </div>
            </ActionForm>
          </details>
        )}
      </section>

      <div className="grid grid-2">
        <section className="card">
          <h2>Dados da OS</h2>
          {editable ? (
            <ActionForm action={saveOrderHeader} submitLabel="Salvar dados">
              <input type="hidden" name="id" value={o.id} />
              <div className="fields">
                <label>Abertura<input name="opened_at" type="date" required max={todayInTimeZone()} defaultValue={o.opened_at} /></label>
                <label>Horímetro na entrada (h)<input name="hours_at_open" inputMode="decimal" defaultValue={o.hours_at_open ?? ''} /></label>
                <label className="span-2">Solicitação do cliente<textarea name="complaint" maxLength={2000} defaultValue={o.complaint ?? ''} /></label>
                <label className="span-2">Diagnóstico / serviço executado<textarea name="diagnosis" maxLength={4000} defaultValue={o.diagnosis ?? ''} /></label>
                <label>Desconto (R$)<input name="discount" inputMode="decimal" defaultValue={o.discount || ''} /></label>
                <label className="span-2">Observações<textarea name="notes" maxLength={2000} defaultValue={o.notes ?? ''} /></label>
              </div>
            </ActionForm>
          ) : (
            <dl className="kv">
              <dt>Horímetro</dt><dd>{formatHours(o.hours_at_open)}</dd>
              <dt>Solicitação</dt><dd>{o.complaint ?? '—'}</dd>
              <dt>Diagnóstico</dt><dd>{o.diagnosis ?? '—'}</dd>
              <dt>Observações</dt><dd>{o.notes ?? '—'}</dd>
            </dl>
          )}
        </section>

        <section className="card" id="checklist">
          <h2>Checklist ({checklist.filter((c) => c.done).length}/{checklist.length})</h2>
          <ul className="checklist">
            {checklist.map((c) => (
              <li key={c.id}>
                <form action={toggleChecklist}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="work_order_id" value={o.id} />
                  <input type="hidden" name="done" value={c.done ? '0' : '1'} />
                  <button className={`check-btn${c.done ? ' on' : ''}`} type="submit" disabled={!editable} aria-label={`${c.done ? 'Desmarcar' : 'Marcar'}: ${c.label}`}>
                    {c.done ? '✓' : ''}
                  </button>
                </form>
                <span className={c.done ? 'done' : undefined}>{c.label}</span>
              </li>
            ))}
          </ul>
          {editable && (
            <form action={addChecklistItem} className="toolbar" style={{ marginTop: '.75rem' }}>
              <input type="hidden" name="work_order_id" value={o.id} />
              <input name="label" required maxLength={200} placeholder="Novo item do checklist" aria-label="Novo item do checklist" style={{ flex: 1 }} />
              <button className="btn btn-sm" type="submit">Incluir</button>
            </form>
          )}
        </section>
      </div>

      <section className="card" id="anexos">
        <h2>Fotos e documentos</h2>
        <Attachments items={attachments} workOrderId={o.id} canEdit={canEdit(user)} />
      </section>

      {user.role === 'admin' && o.status !== 'concluida' && (
        <form action={deleteOrder}>
          <input type="hidden" name="id" value={o.id} />
          <ConfirmButton className="btn btn-danger" message="Excluir esta OS definitivamente? Prefira Cancelar para manter o registro.">Excluir OS</ConfirmButton>
        </form>
      )}
    </>
  );
}
