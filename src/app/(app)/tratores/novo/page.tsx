import type { Metadata } from 'next';
import Link from 'next/link';
import { listOwnerOptions } from '@/lib/data';
import { getModel, listModels } from '@/lib/models';
import { TractorForm } from '@/components/TractorForm';
import { PageHead, one, type SearchParams } from '@/components/ui';

export const metadata: Metadata = { title: 'Novo trator' };

export default async function NovoTrator({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ownerId = Number(one(sp.proprietario)) || undefined;
  const modelId = Number(one(sp.modelo)) || 0;
  const template = modelId ? getModel(modelId) : null;
  const models = listModels();

  return (
    <>
      <PageHead title="Novo trator" back={{ href: '/tratores', label: 'Tratores' }}>
        <Link className="btn" href="/configuracoes/importar">Importar planilha</Link>
      </PageHead>
      {models.length > 0 && (
        <form className="card toolbar">
          {ownerId ? <input type="hidden" name="proprietario" value={ownerId} /> : null}
          <label style={{ flex: '1 1 16rem' }}>Preencher a partir de um modelo
            <select name="modelo" defaultValue={modelId || ''}>
              <option value="">Sem modelo</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.brand} {m.model}</option>)}
            </select>
          </label>
          <button className="btn" type="submit" style={{ alignSelf: 'flex-end' }}>Aplicar modelo</button>
        </form>
      )}
      {template && (
        <p className="alert alert-warn">Dados preenchidos pelo modelo {template.brand} {template.model}. Confira com a máquina antes de salvar.</p>
      )}
      <section className="card">
        <TractorForm
          key={modelId}
          owners={listOwnerOptions()}
          defaultOwnerId={ownerId}
          defaults={template ?? undefined}
          filters={template?.filters ?? []}
        />
      </section>
    </>
  );
}
