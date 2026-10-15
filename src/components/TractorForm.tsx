import Link from 'next/link';
import { saveTractor } from '@/lib/actions';
import type { Tractor, TractorFilter } from '@/lib/data';
import { todayInTimeZone } from '@/lib/status';
import { ActionForm } from './ActionForm';
import { FilterRows } from './FilterRows';

export type TractorDefaults = Pick<Tractor, 'brand' | 'model' | 'oil_spec' | 'oil_capacity_liters' | 'interval_hours' | 'interval_months'>;

export function TractorForm({ tractor, defaults, filters = [], owners, defaultOwnerId }: {
  tractor?: Tractor;
  /** Valores iniciais vindos de um modelo (template). */
  defaults?: TractorDefaults;
  filters?: Pick<TractorFilter, 'filter_type' | 'reference_code' | 'manufacturer' | 'quantity' | 'notes'>[];
  owners: { id: number; name: string }[];
  defaultOwnerId?: number;
}) {
  const today = todayInTimeZone();
  const isNew = !tractor;
  const d: TractorDefaults | undefined = tractor ?? defaults;
  return (
    <ActionForm
      action={saveTractor}
      submitLabel={isNew ? 'Cadastrar trator' : 'Salvar alterações'}
      secondary={<Link className="btn btn-ghost" href={tractor ? `/tratores/${tractor.id}` : '/tratores'}>Cancelar</Link>}
    >
      {tractor && <input type="hidden" name="id" value={tractor.id} />}
      {isNew && <p className="muted">O número interno é gerado automaticamente ao salvar.</p>}
      <div className="fields">
        <label className="span-2">Proprietário *
          <select name="owner_id" required defaultValue={tractor?.owner_id ?? defaultOwnerId ?? ''}>
            <option value="" disabled>Selecione…</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          {owners.length === 0 && <span className="hint">Cadastre um proprietário antes. <Link href="/proprietarios/novo">Novo proprietário</Link></span>}
        </label>
        <label>Marca *<input name="brand" required maxLength={80} defaultValue={d?.brand} /></label>
        <label>Modelo *<input name="model" required maxLength={80} defaultValue={d?.model} /></label>
        <label>Ano<input name="year" type="number" inputMode="numeric" min={1900} max={2100} defaultValue={tractor?.year ?? ''} /></label>
        <label>Nº de série<input name="serial_number" maxLength={80} defaultValue={tractor?.serial_number ?? ''} /></label>
      </div>

      <div className="form-section">
        <h3>Óleo do motor e intervalo de troca</h3>
        <p className="hint">Preencha conforme o manual/cadastro da oficina. Configure horas, meses ou ambos — vence pelo que ocorrer primeiro.</p>
        <div className="fields">
          <label>Especificação do óleo<input name="oil_spec" maxLength={120} placeholder="ex.: 15W40 API CI-4" defaultValue={d?.oil_spec ?? ''} /></label>
          <label>Capacidade (litros)<input name="oil_capacity_liters" inputMode="decimal" defaultValue={d?.oil_capacity_liters ?? ''} /></label>
          <label>Intervalo por horas<input name="interval_hours" inputMode="decimal" placeholder="ex.: 250" defaultValue={d?.interval_hours ?? ''} /></label>
          <label>Intervalo por meses<input name="interval_months" type="number" inputMode="numeric" min={1} max={120} placeholder="ex.: 6" defaultValue={d?.interval_months ?? ''} /></label>
        </div>
      </div>

      <div className="form-section">
        <h3>Filtros compatíveis</h3>
        <p className="hint">Cadastro manual. Linhas sem referência são ignoradas.</p>
        <FilterRows
          initial={filters.map((f) => ({ type: f.filter_type, code: f.reference_code, maker: f.manufacturer ?? '', qty: f.quantity, notes: f.notes ?? '' }))}
        />
      </div>

      {isNew && (
        <>
          <div className="form-section">
            <h3>Horímetro atual</h3>
            <div className="fields">
              <label>Horímetro (h)<input name="current_hours" inputMode="decimal" /></label>
              <label>Data da leitura<input name="hours_read_at" type="date" max={today} defaultValue={today} /></label>
            </div>
          </div>
          <div className="form-section">
            <h3>Última troca já realizada (opcional)</h3>
            <p className="hint">Informe para o sistema já calcular a próxima troca. Sem ela, o trator aparece como “Sem dados”.</p>
            <div className="fields">
              <label>Data da última troca<input name="init_date" type="date" max={today} /></label>
              <label>Horímetro na última troca (h)<input name="init_hours" inputMode="decimal" /></label>
              <label>Óleo utilizado<input name="init_oil" maxLength={120} placeholder="padrão: especificação acima" /></label>
              <label>Litros<input name="init_liters" inputMode="decimal" /></label>
              <label className="check span-2"><input type="checkbox" name="init_filters" value="1" /> Os filtros acima foram trocados nessa ocasião</label>
            </div>
          </div>
        </>
      )}

      <div className="form-section">
        <label>Observações<textarea name="notes" maxLength={2000} defaultValue={tractor?.notes ?? ''} /></label>
      </div>
    </ActionForm>
  );
}
