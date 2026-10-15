// Peças de exibição do catálogo (servidor).
import type { ReactNode } from 'react';
import { saveCatalogApplication } from '@/lib/actions-catalog';
import type { ApplicationRow } from '@/lib/catalog';
import { VERIFICATION_LABEL, VERIFICATION_STATUSES, type SystemGroup } from '@/lib/catalog-core';
import { ActionForm } from './ActionForm';
import { CopyButton } from './CopyButton';

/** Uma aplicação: código em destaque, condição de versão, fonte e observações. */
export function CatalogAppItem({ app, children }: { app: ApplicationRow; children?: ReactNode }) {
  return (
    <li className="filter" style={{ alignItems: 'flex-start' }}>
      <span style={{ flex: '1 1 16rem', minWidth: 0 }}>
        <span className="code">{app.filter_code}</span>{' '}
        <span className="muted">
          {[app.filter_brand, app.position, app.quantity ? `qtd. ${app.quantity}` : null].filter(Boolean).join(', ')}
        </span>
        <span className="item-sub"><strong>Versão:</strong> {app.version_condition ?? 'não informada (verificar)'}</span>
        {app.original_code && <span className="item-sub">Código original de referência: {app.original_code}</span>}
        {app.notes && <span className="item-sub">{app.notes}</span>}
        <span className="item-sub">
          {VERIFICATION_LABEL[app.verification_status]}
          {app.origin === 'oficina' ? ', editado pela oficina' : ''}
          {!app.is_active ? ', DESATIVADO' : ''}
          {app.source_url && (
            <> · <a href={app.source_url} target="_blank" rel="noopener noreferrer nofollow">ver fonte</a></>
          )}
        </span>
      </span>
      <span className="inline-forms" style={{ marginLeft: 'auto' }}>
        <CopyButton value={app.filter_code} />
        {children}
      </span>
    </li>
  );
}

export function SystemHeading({ group }: { group: SystemGroup<unknown> }) {
  return (
    <h3 style={{ marginTop: '1rem' }}>
      {group.system}
      {group.alternatives && (
        <span className="badge badge-proxima" style={{ marginLeft: '.5rem' }}>versões alternativas, não instalar todas</span>
      )}
    </h3>
  );
}

/** Formulário de criar/editar aplicação (origem "oficina"). */
export function ApplicationForm({ modelId, app, systems }: { modelId: string; app?: ApplicationRow; systems: string[] }) {
  return (
    <ActionForm action={saveCatalogApplication} submitLabel={app ? 'Salvar alteração' : 'Adicionar aplicação'}>
      <input type="hidden" name="model_id" value={modelId} />
      {app && <input type="hidden" name="id" value={app.id} />}
      <div className="fields">
        <label>Sistema *
          <input name="system" required maxLength={60} list="catalog-systems" defaultValue={app?.system} placeholder="ex.: óleo do motor" />
          <datalist id="catalog-systems">{systems.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label>Código do filtro * (texto exato)
          <input name="filter_code" required maxLength={80} defaultValue={app?.filter_code} autoCapitalize="characters" />
        </label>
        <label>Marca do filtro<input name="filter_brand" maxLength={80} defaultValue={app?.filter_brand ?? ''} /></label>
        <label>Posição<input name="position" maxLength={60} defaultValue={app?.position ?? ''} placeholder="principal, primário, segurança…" /></label>
        <label className="span-2">Condição de versão (motor/ano/chassi)
          <input name="version_condition" maxLength={300} defaultValue={app?.version_condition ?? ''} />
        </label>
        <label>Código original de referência<input name="original_code" maxLength={80} defaultValue={app?.original_code ?? ''} /></label>
        <label>Quantidade<input name="quantity" type="number" min={1} max={99} defaultValue={app?.quantity ?? ''} /></label>
        <label>Situação
          <select name="verification_status" defaultValue={app?.verification_status ?? 'pendente'}>
            {VERIFICATION_STATUSES.map((s) => <option key={s} value={s}>{VERIFICATION_LABEL[s]}</option>)}
          </select>
        </label>
        <label>Fonte (URL)<input name="source_url" type="url" maxLength={500} defaultValue={app?.source_url ?? ''} /></label>
        <label className="span-2">Observações<input name="notes" maxLength={1000} defaultValue={app?.notes ?? ''} /></label>
      </div>
      {app?.origin === 'importado' && <p className="hint">Ao salvar, a aplicação passa a ser da oficina e importações futuras não a alteram. O estado anterior fica no histórico.</p>}
    </ActionForm>
  );
}
