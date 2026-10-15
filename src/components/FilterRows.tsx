'use client';
import { useState } from 'react';
import { FILTER_TYPES, FILTER_TYPE_LABEL } from '@/lib/format';

export interface FilterRowValue { type: string; code: string; maker: string; qty: number; notes: string }

const empty = (): FilterRowValue => ({ type: 'oleo', code: '', maker: '', qty: 1, notes: '' });

/** Linhas editáveis de filtros (campos enviados como listas: filter_type, filter_code...). */
export function FilterRows({ initial = [], prefix = '', addLabel = 'Adicionar filtro' }: {
  initial?: FilterRowValue[]; prefix?: string; addLabel?: string;
}) {
  const [rows, setRows] = useState(() => initial.map((r, i) => ({ ...r, key: i })));
  return (
    <div className="filter-rows">
      {rows.map((r) => (
        <div className="filter-row" key={r.key}>
          <label>Tipo
            <select name={`${prefix}filter_type`} defaultValue={r.type}>
              {FILTER_TYPES.map((t) => <option key={t} value={t}>{FILTER_TYPE_LABEL[t]}</option>)}
            </select>
          </label>
          <label>Referência / código *
            <input name={`${prefix}filter_code`} defaultValue={r.code} required maxLength={80} autoCapitalize="characters" />
          </label>
          <label>Fabricante
            <input name={`${prefix}filter_maker`} defaultValue={r.maker} maxLength={80} />
          </label>
          <label>Qtd.
            <input name={`${prefix}filter_qty`} type="number" min={1} max={99} defaultValue={r.qty} inputMode="numeric" />
          </label>
          <label className="filter-notes">Observação
            <input name={`${prefix}filter_notes`} defaultValue={r.notes} maxLength={200} />
          </label>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}>
            Remover
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setRows((prev) => [...prev, { ...empty(), key: Math.max(-1, ...prev.map((x) => x.key)) + 1 }])}
      >
        + {addLabel}
      </button>
    </div>
  );
}
