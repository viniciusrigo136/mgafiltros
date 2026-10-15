import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listCatalogBrands, listCatalogModels, listCatalogSystems } from '@/lib/catalog';
import { CATALOG_ALERT } from '@/lib/catalog-core';
import { findTractorIdByNumber } from '@/lib/data';
import { Empty, Flash, PageHead, one, type SearchParams } from '@/components/ui';

export const metadata: Metadata = { title: 'Catálogo de filtros' };

export default async function Catalogo({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const brandId = one(sp.marca);
  const system = one(sp.sistema);

  // Número puro = nº interno do trator: abre os candidatos na ficha dele.
  if (/^\d+$/.test(q)) {
    const tractorId = await findTractorIdByNumber(Number(q));
    if (tractorId) redirect(`/tratores/${tractorId}#catalogo`);
  }

  const [brands, models, systems] = await Promise.all([listCatalogBrands(), listCatalogModels({ q, brandId, system }), listCatalogSystems()]);
  const params = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(brandId && { marca: brandId }), ...(system && { sistema: system }), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/catalogo${p.size ? `?${p}` : ''}`;
  };

  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <PageHead title="Catálogo de filtros">
        <Link className="btn" href="/catalogo/marcas">Marcas e modelos</Link>
        <Link className="btn" href="/configuracoes/catalogo">Importar catálogo</Link>
      </PageHead>
      <p className="alert alert-warn">
        Compatibilidades de catálogo publicadas, não homologadas pelo chassi. {CATALOG_ALERT}
      </p>

      <form className="toolbar" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Marca, modelo (ex.: 5075E), código do filtro ou nº do trator" aria-label="Buscar no catálogo" />
        {brandId && <input type="hidden" name="marca" value={brandId} />}
        <select name="sistema" defaultValue={system} aria-label="Sistema">
          <option value="">Todos os sistemas</option>
          {systems.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn" type="submit">Buscar</button>
      </form>

      <div className="toolbar">
        <Link className={`btn btn-sm${!brandId ? ' btn-dark' : ''}`} href={params({ marca: '' })}>Todas as marcas</Link>
        {brands.map((b) => (
          <Link key={b.id} className={`btn btn-sm${brandId === b.id ? ' btn-dark' : ''}`} href={params({ marca: b.id })}>
            {b.name} <span className="muted">({b.model_count})</span>
          </Link>
        ))}
      </div>

      {brands.length === 0 ? (
        <Empty>Catálogo vazio. <Link href="/configuracoes/catalogo">Importe o catálogo inicial</Link>.</Empty>
      ) : models.length === 0 ? (
        <Empty>
          Nenhum modelo encontrado.
          {brandId && brands.find((b) => b.id === brandId)?.coverage === 'a_pesquisar' ? ' Esta marca ainda está a pesquisar.' : ''}
        </Empty>
      ) : (
        <ul className="list">
          {models.map((m) => (
            <li key={m.id}>
              <Link href={`/catalogo/${encodeURIComponent(m.id)}${system ? `?sistema=${encodeURIComponent(system)}` : ''}`} className="item">
                <span className="item-body">
                  <span className="item-title">{m.brand_name} {m.model}</span>
                  <span className="item-sub">
                    {m.app_count} {m.app_count === 1 ? 'aplicação' : 'aplicações'}
                    {m.engine_ref ? `, motor ${m.engine_ref}` : ''}
                    {m.tractor_count ? `, ${m.tractor_count} ${m.tractor_count === 1 ? 'trator vinculado' : 'tratores vinculados'}` : ''}
                  </span>
                  {m.systems && <span className="tags">{m.systems.split(',').map((s) => <span className="tag" key={s}>{s}</span>)}</span>}
                </span>
                <span className="badge badge-sem_dados">{m.catalog_status === 'parcial' ? 'Parcial' : (m.catalog_status ?? '—')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
