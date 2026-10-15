import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getApplicationHistory, getCatalogModel, listApplications, listCatalogSystems, tractorsUsingModel } from '@/lib/catalog';
import { setApplicationActive } from '@/lib/actions-catalog';
import { CATALOG_ALERT, groupBySystem } from '@/lib/catalog-core';
import { canEdit, requireUser } from '@/lib/auth';
import { ApplicationForm, CatalogAppItem, SystemHeading } from '@/components/CatalogApp';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Empty, Flash, PageHead, one, type SearchParams } from '@/components/ui';

export default async function ModeloCatalogo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const [{ id: rawId }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const id = decodeURIComponent(rawId);
  const system = one(sp.sistema);
  const showInactive = one(sp.inativos) === '1';
  const editing = one(sp.editar);
  const [model, apps, systems, tractors] = await Promise.all([
    getCatalogModel(id),
    listApplications(id, { includeInactive: showInactive, system: system || undefined }),
    listCatalogSystems(),
    tractorsUsingModel(id),
  ]);
  if (!model) notFound();
  const editable = canEdit(user);
  const groups = groupBySystem(apps);
  const editingApp = editing ? apps.find((a) => a.id === editing) : undefined;
  const history = editingApp ? await getApplicationHistory(editingApp.id) : [];
  const base = `/catalogo/${encodeURIComponent(id)}`;

  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <PageHead title={`${model.brand_name} ${model.model}`} back={{ href: '/catalogo', label: 'Catálogo' }}>
        <Link className="btn" href={`${base}?inativos=${showInactive ? '0' : '1'}`}>{showInactive ? 'Ocultar desativadas' : 'Mostrar desativadas'}</Link>
      </PageHead>
      <p className="alert alert-warn">
        <strong>{CATALOG_ALERT}</strong> Várias opções no mesmo sistema são variantes por motor, ano ou cabine: escolha a que corresponde ao trator, não todas.
      </p>
      <div className="card">
        <dl className="kv">
          <dt>Motor de referência</dt><dd>{model.engine_ref ?? 'não informado'}</dd>
          <dt>Situação do catálogo</dt><dd>{model.catalog_status ?? '—'}</dd>
          <dt>Aplicações</dt><dd>{model.app_count}</dd>
          {model.notes && <><dt>Observação</dt><dd>{model.notes}</dd></>}
          <dt>Tratores vinculados</dt>
          <dd>
            {tractors.length === 0 ? 'nenhum' : tractors.map((t, i) => (
              <span key={t.id}>{i > 0 && ', '}<Link href={`/tratores/${t.id}#catalogo`}>nº {t.sequential_number} ({t.owner_name})</Link></span>
            ))}
          </dd>
        </dl>
      </div>

      <form className="toolbar">
        {showInactive && <input type="hidden" name="inativos" value="1" />}
        <select name="sistema" defaultValue={system} aria-label="Filtrar por sistema">
          <option value="">Todos os sistemas</option>
          {systems.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn btn-sm" type="submit">Filtrar</button>
      </form>

      <section className="card">
        <h2>Filtros por sistema</h2>
        {groups.length === 0 ? <Empty>Nenhuma aplicação {system ? 'neste sistema' : 'cadastrada'}.</Empty> : groups.map((g) => (
          <div key={g.system}>
            <SystemHeading group={g} />
            <ul className="filters">
              {g.items.map((a) => (
                <CatalogAppItem key={a.id} app={a}>
                  {editable && (
                    <>
                      <Link className="btn btn-sm" href={`${base}?editar=${encodeURIComponent(a.id)}#editar`}>Editar</Link>
                      <form action={setApplicationActive}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="active" value={a.is_active ? '0' : '1'} />
                        {a.is_active ? (
                          <ConfirmButton className="btn btn-sm btn-ghost" message="Desativar esta aplicação? Ela some das sugestões, mas fica no histórico.">Desativar</ConfirmButton>
                        ) : (
                          <button className="btn btn-sm" type="submit">Reativar</button>
                        )}
                      </form>
                    </>
                  )}
                </CatalogAppItem>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {editable && (
        <section className="card" id="editar">
          <h2>{editingApp ? `Editar aplicação ${editingApp.filter_code}` : 'Adicionar aplicação'}</h2>
          <ApplicationForm key={editingApp?.id ?? 'nova'} modelId={id} app={editingApp} systems={systems} />
          {editingApp && (
            <>
              <p><Link href={base}>Cancelar edição</Link></p>
              {history.length > 0 && (
                <details>
                  <summary>Histórico de alterações ({history.length})</summary>
                  <ul>
                    {history.map((h) => {
                      const s = JSON.parse(h.snapshot) as { filter_code?: string; version_condition?: string };
                      return <li key={h.id}>{h.changed_at.slice(0, 10).split('-').reverse().join('/')}, {h.changed_by ?? '—'}: era {s.filter_code} ({s.version_condition ?? 'sem condição'})</li>;
                    })}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
