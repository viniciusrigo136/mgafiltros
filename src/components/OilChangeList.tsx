import Link from 'next/link';
import { deleteOilChange } from '@/lib/actions';
import type { OilChange } from '@/lib/data';
import { filterTypeLabel, formatDate, formatHours, formatNumber } from '@/lib/format';
import { ConfirmButton } from './ConfirmButton';
import { Empty } from './ui';

/** Histórico cronológico (mais recente primeiro) com os dados gravados no momento do serviço. */
export function OilChangeList({ changes, showTractor = false, allowDelete = false }: {
  changes: OilChange[]; showTractor?: boolean; allowDelete?: boolean;
}) {
  if (!changes.length) return <Empty>Nenhuma troca de óleo registrada.</Empty>;
  return (
    <ol className="timeline">
      {changes.map((c) => (
        <li key={c.id} className={c.is_initial ? 'initial' : undefined}>
          <div className="item-title">
            {formatDate(c.serviced_at)} · {formatHours(c.service_hours)}
            {c.is_initial ? <span className="muted"> (informada no cadastro)</span> : null}
          </div>
          {showTractor && (
            <div>
              <Link href={`/tratores/${c.tractor_id}`}><strong>Nº {c.sequential_number}</strong> {c.brand} {c.model}</Link>
              {' · '}
              <Link href={`/proprietarios/${c.owner_id}`}>{c.owner_name}</Link>
            </div>
          )}
          <div className="item-sub">
            Óleo: {c.oil_used ?? '—'}{c.liters_used != null ? ` · ${formatNumber(c.liters_used)} L` : ''}
            {c.performed_by ? ` · Resp.: ${c.performed_by}` : ''}
          </div>
          {c.filters.length > 0 && (
            <div className="tags">
              {c.filters.map((f, i) => (
                <span className="tag" key={i}>
                  {filterTypeLabel(f.filter_type_snapshot)}: {f.reference_code_snapshot}{f.quantity > 1 ? ` ×${f.quantity}` : ''}
                </span>
              ))}
            </div>
          )}
          {c.notes && <div className="item-sub">{c.notes}</div>}
          {allowDelete && (
            <form action={deleteOilChange} style={{ marginTop: '.35rem' }}>
              <input type="hidden" name="id" value={c.id} />
              <ConfirmButton className="btn btn-sm btn-ghost" message="Excluir este registro de troca? Use apenas para lançamentos feitos por engano.">
                Excluir registro
              </ConfirmButton>
            </form>
          )}
        </li>
      ))}
    </ol>
  );
}
