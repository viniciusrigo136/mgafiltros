import Link from 'next/link';
import { saveModel } from '@/lib/actions-models';
import type { ModelFilter, TractorModel } from '@/lib/models';
import { ActionForm } from './ActionForm';
import { FilterRows } from './FilterRows';

export function ModelForm({ model, filters = [] }: { model?: TractorModel; filters?: ModelFilter[] }) {
  return (
    <ActionForm
      action={saveModel}
      submitLabel={model ? 'Salvar modelo' : 'Cadastrar modelo'}
      secondary={<Link className="btn btn-ghost" href="/modelos">Cancelar</Link>}
    >
      {model && <input type="hidden" name="id" value={model.id} />}
      <p className="hint">Preencha só com dados conferidos (manual do fabricante ou cadastro da oficina). O modelo apenas sugere valores ao cadastrar um trator.</p>
      <div className="fields">
        <label>Marca *<input name="brand" required maxLength={80} defaultValue={model?.brand} /></label>
        <label>Modelo *<input name="model" required maxLength={80} defaultValue={model?.model} /></label>
        <label>Especificação do óleo<input name="oil_spec" maxLength={120} defaultValue={model?.oil_spec ?? ''} /></label>
        <label>Capacidade (litros)<input name="oil_capacity_liters" inputMode="decimal" defaultValue={model?.oil_capacity_liters ?? ''} /></label>
        <label>Intervalo por horas<input name="interval_hours" inputMode="decimal" defaultValue={model?.interval_hours ?? ''} /></label>
        <label>Intervalo por meses<input name="interval_months" type="number" min={1} max={120} inputMode="numeric" defaultValue={model?.interval_months ?? ''} /></label>
        <label className="span-2">Observações<textarea name="notes" maxLength={2000} defaultValue={model?.notes ?? ''} /></label>
      </div>
      <div className="form-section">
        <h3>Filtros</h3>
        <FilterRows
          initial={filters.map((f) => ({ type: f.filter_type, code: f.reference_code, maker: f.manufacturer ?? '', qty: f.quantity, notes: f.notes ?? '' }))}
        />
      </div>
    </ActionForm>
  );
}
