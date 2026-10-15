import Link from 'next/link';
import { confirmTractorFilter, linkTractorModel } from '@/lib/actions-catalog';
import {
  confirmationHistory, listModelOptions, suggestCatalogModel, tractorCandidates, type ConfirmationStatus,
} from '@/lib/catalog';
import { CATALOG_ALERT, groupBySystem } from '@/lib/catalog-core';
import { formatDate } from '@/lib/format';
import { todayInTimeZone } from '@/lib/status';
import { ActionForm } from './ActionForm';
import { CatalogAppItem, SystemHeading } from './CatalogApp';

const STATE_LABEL: Record<ConfirmationStatus, string> = { candidato: 'Candidato a verificar', confirmado: 'Confirmado neste trator', descartado: 'Descartado neste trator' };
const STATE_BADGE: Record<ConfirmationStatus, string> = { candidato: 'badge-sem_dados', confirmado: 'badge-em_dia', descartado: 'badge-inativo' };

/** Candidatos do catálogo para o trator e confirmações feitas para ESTE trator. */
export async function TractorCatalog({ tractor, editable, userName, system, state }: {
  tractor: { id: number; brand: string; model: string; catalog_model_id: string | null };
  editable: boolean;
  userName: string;
  system: string;
  state: string;
}) {
  const [candidates, options, history, suggestions] = await Promise.all([
    tractorCandidates(tractor.id, tractor.catalog_model_id),
    listModelOptions(),
    confirmationHistory(tractor.id),
    tractor.catalog_model_id ? Promise.resolve([]) : suggestCatalogModel(tractor.brand, tractor.model),
  ]);
  const visible = candidates.filter((c) => (!system || c.system === system) && (!state || c.state === state));
  const groups = groupBySystem(visible);
  const systems = [...new Set(candidates.map((c) => c.system))];
  const count = (s: ConfirmationStatus) => candidates.filter((c) => c.state === s).length;
  const today = todayInTimeZone();
  const linked = options.find((o) => o.id === tractor.catalog_model_id);

  return (
    <section className="card" id="catalogo">
      <h2>
        Catálogo de filtros
        {linked && <Link className="btn btn-sm" href={`/catalogo/${encodeURIComponent(linked.id)}`}>Ver modelo {linked.label}</Link>}
      </h2>

      {editable && (
        <form action={linkTractorModel} className="toolbar">
          <input type="hidden" name="tractor_id" value={tractor.id} />
          <label style={{ flex: '1 1 16rem' }}>Modelo no catálogo
            <select name="catalog_model_id" defaultValue={tractor.catalog_model_id ?? suggestions[0]?.id ?? ''}>
              <option value="">Não vinculado</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <button className="btn btn-sm" type="submit" style={{ alignSelf: 'flex-end' }}>Vincular</button>
        </form>
      )}
      {!tractor.catalog_model_id && (
        <p className="muted">
          {suggestions.length
            ? `Sugestão pelo cadastro (${tractor.brand} ${tractor.model}): ${suggestions.map((s) => s.label).join(', ')}. Confira e clique em Vincular.`
            : options.length
              ? 'Nenhum modelo do catálogo corresponde a este trator. Vincule manualmente, se houver.'
              : <>Catálogo vazio. <Link href="/configuracoes/catalogo">Importar catálogo</Link>.</>}
        </p>
      )}

      {tractor.catalog_model_id && (
        <>
          <p className="alert alert-warn">
            <strong>{CATALOG_ALERT}</strong> Ano e versão deste trator não são conferidos automaticamente: tudo abaixo é <strong>candidato a verificar</strong> até um mecânico confirmar. Só o que for confirmado pode ir para os filtros do trator, OS ou estoque.
          </p>
          <div className="mini-stats">
            <span><strong>{count('candidato')}</strong> candidatos</span>
            <span className="ok-text"><strong>{count('confirmado')}</strong> confirmados</span>
            <span><strong>{count('descartado')}</strong> descartados</span>
          </div>
          <form className="toolbar">
            <select name="sistema_cat" defaultValue={system} aria-label="Sistema">
              <option value="">Todos os sistemas</option>
              {systems.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select name="situacao_cat" defaultValue={state} aria-label="Situação neste trator">
              <option value="">Todas as situações</option>
              <option value="candidato">Candidatos a verificar</option>
              <option value="confirmado">Confirmados</option>
              <option value="descartado">Descartados</option>
            </select>
            <button className="btn btn-sm" type="submit">Filtrar</button>
          </form>

          {groups.length === 0 ? <p className="muted">Nada com esses filtros.</p> : groups.map((g) => (
            <div key={g.system}>
              <SystemHeading group={g} />
              <ul className="filters">
                {g.items.map((c) => (
                  <CatalogAppItem key={c.id} app={c}>
                    <span className={`badge ${STATE_BADGE[c.state]}`}>{STATE_LABEL[c.state]}</span>
                  </CatalogAppItem>
                ))}
              </ul>
              {g.items.map((c) => c.last && (
                <p key={`l-${c.id}`} className="hint" style={{ margin: '.2rem 0 0 .75rem' }}>
                  {c.filter_code}: {STATE_LABEL[c.state].toLowerCase()} em {formatDate(c.last.confirmed_on)}
                  {c.last.responsible ? ` por ${c.last.responsible}` : ''}{c.last.notes ? `: ${c.last.notes}` : ''}
                </p>
              ))}
              {editable && (
                <details style={{ marginLeft: '.75rem' }}>
                  <summary>Confirmar ou descartar em {g.system}</summary>
                  <ActionForm action={confirmTractorFilter} submitLabel="Registrar">
                    <input type="hidden" name="tractor_id" value={tractor.id} />
                    <div className="fields">
                      <label className="span-2">Filtro
                        <select name="application_id" required defaultValue="">
                          <option value="" disabled>Selecione o código…</option>
                          {g.items.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.filter_code} ({c.position ?? 'sem posição'}; {c.version_condition ?? 'versão não informada'})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>Situação neste trator
                        <select name="status" defaultValue="confirmado">
                          <option value="confirmado">Confirmado (conferido na peça/chassi/manual)</option>
                          <option value="descartado">Descartado (não serve neste trator)</option>
                          <option value="candidato">Voltar a candidato</option>
                        </select>
                      </label>
                      <label>Data<input name="confirmed_on" type="date" max={today} defaultValue={today} /></label>
                      <label>Responsável<input name="responsible" maxLength={120} defaultValue={userName} /></label>
                      <label>Observação<input name="notes" maxLength={1000} placeholder="ex.: conferido na peça removida" /></label>
                      <label className="check span-2">
                        <input type="checkbox" name="add_to_tractor" value="1" defaultChecked />
                        Ao confirmar, incluir nos filtros deste trator (usados nas trocas, OS e estoque)
                      </label>
                    </div>
                  </ActionForm>
                </details>
              )}
            </div>
          ))}
        </>
      )}

      {history.length > 0 && (
        <details>
          <summary>Histórico de confirmações deste trator ({history.length})</summary>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Sistema</th><th>Código</th><th>Situação</th><th>Responsável</th><th>Observação</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{formatDate(h.confirmed_on)}</td><td>{h.system}</td><td><strong>{h.filter_code}</strong></td>
                    <td>{STATE_LABEL[h.status]}</td><td>{h.responsible ?? '—'}</td><td>{h.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
