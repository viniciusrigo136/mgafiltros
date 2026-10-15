import type { Metadata } from 'next';
import Link from 'next/link';
import { listCatalogBrands, listCatalogModels } from '@/lib/catalog';
import { saveCatalogBrand, saveCatalogModel } from '@/lib/actions-catalog';
import { canEdit, requireUser } from '@/lib/auth';
import { ActionForm } from '@/components/ActionForm';
import { Flash, PageHead, one, type SearchParams } from '@/components/ui';

export const metadata: Metadata = { title: 'Marcas e modelos do catálogo' };

const COVERAGE: Record<string, string> = { pesquisada: 'pesquisada', a_pesquisar: 'a pesquisar' };

export default async function MarcasCatalogo({ searchParams }: { searchParams: SearchParams }) {
  const [sp, user] = await Promise.all([searchParams, requireUser()]);
  const [brands, models] = await Promise.all([listCatalogBrands(), listCatalogModels()]);
  const editable = canEdit(user);

  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <PageHead title="Marcas e modelos" back={{ href: '/catalogo', label: 'Catálogo' }} />
      <div className="grid grid-2">
        <section className="card">
          <h2>Marcas ({brands.length})</h2>
          <ul className="list">
            {brands.map((b) => (
              <li key={b.id} className="item" style={{ display: 'block' }}>
                <details>
                  <summary>
                    {b.name} <span className="muted">({b.model_count} modelos, {COVERAGE[b.coverage ?? ''] ?? b.coverage ?? '—'}{b.origin === 'oficina' ? ', editada pela oficina' : ''})</span>
                  </summary>
                  <ul className="tags">
                    {models.filter((m) => m.brand_id === b.id).map((m) => (
                      <li key={m.id} className="tag" style={{ listStyle: 'none' }}><Link href={`/catalogo/${encodeURIComponent(m.id)}`}>{m.model}</Link></li>
                    ))}
                  </ul>
                  {editable && (
                    <ActionForm action={saveCatalogBrand} submitLabel="Salvar marca">
                      <input type="hidden" name="id" value={b.id} />
                      <div className="fields">
                        <label>Nome<input name="name" required maxLength={80} defaultValue={b.name} /></label>
                        <label>Cobertura
                          <select name="coverage" defaultValue={b.coverage ?? 'a_pesquisar'}>
                            <option value="pesquisada">pesquisada</option>
                            <option value="a_pesquisar">a pesquisar</option>
                          </select>
                        </label>
                      </div>
                    </ActionForm>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </section>

        {editable && (
          <div>
            <section className="card">
              <h2>Nova marca</h2>
              <ActionForm action={saveCatalogBrand} submitLabel="Cadastrar marca">
                <div className="fields">
                  <label>Nome *<input name="name" required maxLength={80} /></label>
                  <label>Cobertura
                    <select name="coverage" defaultValue="a_pesquisar">
                      <option value="pesquisada">pesquisada</option>
                      <option value="a_pesquisar">a pesquisar</option>
                    </select>
                  </label>
                </div>
              </ActionForm>
            </section>
            <section className="card">
              <h2>Novo modelo</h2>
              <ActionForm action={saveCatalogModel} submitLabel="Cadastrar modelo">
                <div className="fields">
                  <label>Marca *
                    <select name="brand_id" required defaultValue="">
                      <option value="" disabled>Selecione…</option>
                      {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </label>
                  <label>Modelo *<input name="model" required maxLength={80} placeholder="ex.: 5075E" /></label>
                  <label>Motor de referência<input name="engine_ref" maxLength={120} /></label>
                  <label>Situação
                    <select name="catalog_status" defaultValue="parcial">
                      <option value="parcial">parcial</option>
                      <option value="completo">completo</option>
                    </select>
                  </label>
                  <label className="span-2">Observação<input name="notes" maxLength={1000} /></label>
                </div>
              </ActionForm>
              <p className="hint">Depois de criar, adicione os filtros na página do modelo.</p>
            </section>
          </div>
        )}
      </div>
    </>
  );
}
