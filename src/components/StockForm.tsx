import Link from 'next/link';
import { saveStockItem } from '@/lib/actions-stock';
import { STOCK_KINDS, STOCK_KIND_LABEL, type StockItem } from '@/lib/stock';
import { ActionForm } from './ActionForm';

export function StockForm({ item }: { item?: StockItem }) {
  return (
    <ActionForm
      action={saveStockItem}
      submitLabel={item ? 'Salvar item' : 'Cadastrar item'}
      secondary={<Link className="btn btn-ghost" href={item ? `/estoque/${item.id}` : '/estoque'}>Cancelar</Link>}
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="fields">
        <label>Tipo *
          <select name="kind" required defaultValue={item?.kind ?? 'filtro'}>
            {STOCK_KINDS.map((k) => <option key={k} value={k}>{STOCK_KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label>Código / referência *
          <input name="reference_code" required maxLength={80} defaultValue={item?.reference_code} autoCapitalize="characters" />
          <span className="hint">Use o mesmo código do cadastro do trator para a baixa automática. Para óleo, use a especificação (ex.: 15W40).</span>
        </label>
        <label className="span-2">Descrição<input name="description" maxLength={200} defaultValue={item?.description ?? ''} /></label>
        <label>Fabricante<input name="manufacturer" maxLength={80} defaultValue={item?.manufacturer ?? ''} /></label>
        <label>Unidade<input name="unit" maxLength={10} defaultValue={item?.unit ?? 'un'} placeholder="un, L, kg" /></label>
        <label>Estoque mínimo<input name="min_quantity" inputMode="decimal" defaultValue={item?.min_quantity || ''} /></label>
        <label>Localização<input name="location" maxLength={80} defaultValue={item?.location ?? ''} placeholder="prateleira, corredor…" /></label>
        <label>Preço de custo (R$)<input name="cost_price" inputMode="decimal" defaultValue={item?.cost_price ?? ''} /></label>
        <label>Preço de venda (R$)<input name="sale_price" inputMode="decimal" defaultValue={item?.sale_price ?? ''} /></label>
        {!item && <label>Quantidade inicial<input name="initial_quantity" inputMode="decimal" /></label>}
      </div>
    </ActionForm>
  );
}
