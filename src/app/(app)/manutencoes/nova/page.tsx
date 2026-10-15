import type { Metadata } from 'next';
import Link from 'next/link';
import { getTractor, getTractorFilters, listTractorOptions } from '@/lib/data';
import { saveOilChange } from '@/lib/actions';
import { requireUser } from '@/lib/auth';
import { filterTypeLabel, formatDate, formatHours } from '@/lib/format';
import { todayInTimeZone } from '@/lib/status';
import { ActionForm } from '@/components/ActionForm';
import { FilterRows } from '@/components/FilterRows';
import { Empty, PageHead, one, type SearchParams } from '@/components/ui';

export const metadata: Metadata = { title: 'Registrar troca de óleo' };

export default async function NovaTroca({ searchParams }: { searchParams: SearchParams }) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const tractorId = Number(one(sp.trator)) || 0;
  const workOrderId = Number(one(sp.os)) || 0;
  const t = tractorId ? await getTractor(tractorId) : null;
  const today = todayInTimeZone();

  if (!t) {
    const options = await listTractorOptions();
    return (
      <>
        <PageHead title="Registrar troca de óleo" back={{ href: '/manutencoes', label: 'Manutenções' }} />
        <section className="card">
          {options.length === 0 ? (
            <Empty>Nenhum trator ativo. <Link href="/tratores/novo">Cadastrar trator</Link></Empty>
          ) : (
            <form className="form">
              <label>Trator *
                <select name="trator" required defaultValue="">
                  <option value="" disabled>Selecione o trator…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>Nº {o.sequential_number} — {o.brand} {o.model} ({o.owner_name})</option>
                  ))}
                </select>
              </label>
              <div className="form-actions"><button className="btn btn-primary" type="submit">Continuar</button></div>
            </form>
          )}
        </section>
      </>
    );
  }

  const filters = await getTractorFilters(t.id);
  return (
    <>
      <PageHead title={`Troca de óleo — trator nº ${t.sequential_number}`} back={{ href: `/tratores/${t.id}`, label: 'Ficha do trator' }} />
      <section className="card">
        <p>
          <strong>{t.brand} {t.model}</strong> · {t.owner_name}<br />
          <span className="muted">
            Última leitura: {formatHours(t.current_hours)} em {formatDate(t.hours_read_at)}
            {t.last_change_date && ` · Última troca: ${formatDate(t.last_change_date)} (${formatHours(t.last_change_hours)})`}
          </span>
        </p>
        <ActionForm
          action={saveOilChange}
          submitLabel="Registrar troca"
          secondary={<Link className="btn btn-ghost" href={`/tratores/${t.id}`}>Cancelar</Link>}
        >
          <input type="hidden" name="tractor_id" value={t.id} />
          {workOrderId ? <input type="hidden" name="work_order_id" value={workOrderId} /> : null}
          {workOrderId ? <p className="muted">Vinculada à OS (as peças da OS já são baixadas do estoque ao concluí-la).</p> : null}
          <div className="fields">
            <label>Data do serviço *<input name="serviced_at" type="date" required max={today} defaultValue={today} /></label>
            <label>Horímetro no serviço (h) *<input name="service_hours" inputMode="decimal" required defaultValue={t.current_hours ?? ''} /></label>
            <label>Óleo utilizado<input name="oil_used" maxLength={120} defaultValue={t.oil_spec ?? ''} /></label>
            <label>Litros<input name="liters_used" inputMode="decimal" defaultValue={t.oil_capacity_liters ?? ''} /></label>
            <label>Responsável<input name="performed_by" maxLength={120} defaultValue={user.name} /></label>
          </div>

          <div className="form-section">
            <h3>Filtros substituídos</h3>
            <p className="hint">A referência fica registrada no histórico como estava no dia do serviço.</p>
            {filters.length === 0 && <p className="muted">Nenhum filtro cadastrado neste trator.</p>}
            {filters.map((f) => (
              <label className="check" key={f.id}>
                <input type="checkbox" name="filter_id" value={f.id} defaultChecked={f.filter_type === 'oleo'} />
                {filterTypeLabel(f.filter_type)}: <span className="code" style={{ fontSize: '1rem' }}>{f.reference_code}</span>
                {f.quantity > 1 ? ` ×${f.quantity}` : ''}
              </label>
            ))}
            <div style={{ marginTop: '.75rem' }}>
              <FilterRows prefix="extra_" addLabel="Outro filtro substituído" />
            </div>
          </div>

          <div className="form-section">
            {!workOrderId && (
              <label className="check" style={{ marginBottom: '.75rem' }}>
                <input type="checkbox" name="deduct_stock" value="1" defaultChecked />
                Baixar filtros e óleo do estoque (pelos códigos cadastrados)
              </label>
            )}
            <label>Observações<textarea name="notes" maxLength={2000} /></label>
            <details>
              <summary>Correção (horímetro menor que o anterior / substituição)</summary>
              <div className="fields">
                <label className="check span-2"><input type="checkbox" name="correction" value="1" /> Registrar mesmo com horímetro inconsistente</label>
                <label className="span-2">Justificativa<input name="reason" maxLength={500} /></label>
              </div>
            </details>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
