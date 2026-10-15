import { notFound } from 'next/navigation';
import { getOrder } from '@/lib/orders';
import { getSettings } from '@/lib/settings';
import { formatDate, formatHours, formatNumber, formatPhone } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { PrintButton } from '@/components/PrintButton';
import { Brand, PageHead } from '@/components/ui';

/** Orçamento / OS em formato de documento (imprimir ou salvar como PDF pelo navegador). */
export default async function ImprimirOrdem({ params }: { params: Promise<{ id: string }> }) {
  const data = await getOrder(Number((await params).id));
  if (!data) notFound();
  const { order: o, items, checklist, totals } = data;
  const s = await getSettings();
  const isQuote = o.status === 'orcamento';

  return (
    <>
      <div className="no-print">
        <PageHead title={isQuote ? 'Orçamento' : 'Ordem de serviço'} back={{ href: `/ordens/${o.id}`, label: `OS ${o.number}` }}>
          <PrintButton label="Imprimir ou salvar PDF" />
        </PageHead>
      </div>
      <article className="doc">
        <header className="doc-head">
          <div>
            <Brand />
            <div style={{ marginTop: '.4rem', fontSize: '.85rem' }}>
              <strong>{s.shopName}</strong>
              {s.shopDocument && <div>CNPJ/CPF {s.shopDocument}</div>}
              {s.shopAddress && <div>{s.shopAddress}</div>}
              {s.shopPhone && <div>{s.shopPhone}</div>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h1>{isQuote ? 'Orçamento' : 'Ordem de serviço'} nº {o.number}</h1>
            <div>Emissão: {formatDate(o.opened_at)}</div>
            {o.closed_at && <div>Conclusão: {formatDate(o.closed_at)}</div>}
          </div>
        </header>

        <dl className="kv" style={{ marginBottom: '1rem' }}>
          <dt>Cliente</dt><dd>{o.owner_name}{o.owner_phone ? `, ${formatPhone(o.owner_phone)}` : ''}{o.owner_city ? `, ${o.owner_city}` : ''}</dd>
          <dt>Equipamento</dt><dd>Trator nº {o.sequential_number}: {o.brand} {o.model}{o.serial_number ? `, série ${o.serial_number}` : ''}</dd>
          <dt>Horímetro</dt><dd>{formatHours(o.hours_at_open)}</dd>
          {o.complaint && <><dt>Solicitação</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{o.complaint}</dd></>}
          {o.diagnosis && <><dt>Diagnóstico</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{o.diagnosis}</dd></>}
        </dl>

        <table>
          <thead><tr><th>Descrição</th><th>Código</th><th className="num">Qtd.</th><th className="num">Unitário</th><th className="num">Total</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.description}</td>
                <td>{i.reference_code ?? ''}</td>
                <td className="num">{formatNumber(i.quantity)}</td>
                <td className="num">{formatMoney(i.unit_price)}</td>
                <td className="num">{formatMoney(i.quantity * i.unit_price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={4}>Peças</td><td className="num">{formatMoney(totals.parts)}</td></tr>
            <tr><td colSpan={4}>Mão de obra</td><td className="num">{formatMoney(totals.labor)}</td></tr>
            {totals.discount > 0 && <tr><td colSpan={4}>Desconto</td><td className="num">−{formatMoney(totals.discount)}</td></tr>}
            <tr><td colSpan={4} style={{ fontSize: '1.15rem' }}>Total</td><td className="num" style={{ fontSize: '1.15rem' }}>{formatMoney(totals.total)}</td></tr>
          </tfoot>
        </table>

        {checklist.length > 0 && !isQuote && (
          <>
            <h2 style={{ marginTop: '1.25rem' }}>Checklist</h2>
            <ul style={{ columns: 2, paddingLeft: '1.1rem', margin: 0 }}>
              {checklist.map((c) => <li key={c.id}>{c.done ? '☑' : '☐'} {c.label}</li>)}
            </ul>
          </>
        )}
        {o.notes && <p style={{ whiteSpace: 'pre-wrap' }}><strong>Observações:</strong> {o.notes}</p>}
        {isQuote && <p className="muted">Orçamento sujeito à confirmação após desmontagem e à disponibilidade de peças.</p>}

        <div className="signatures">
          <div>{s.shopName}</div>
          <div>{o.owner_name}</div>
        </div>
      </article>
    </>
  );
}
