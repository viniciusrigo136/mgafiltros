import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { CATALOG_ALERT } from '@/lib/catalog-core';
import { CatalogImport } from '@/components/CatalogImport';
import { PageHead } from '@/components/ui';

export const metadata: Metadata = { title: 'Importar catálogo' };

export default async function ImportarCatalogo() {
  const user = await requireUser();
  return (
    <>
      <PageHead title="Importar catálogo de filtros" back={{ href: '/configuracoes', label: 'Configurações' }}>
        <Link className="btn" href="/catalogo">Abrir catálogo</Link>
      </PageHead>
      <section className="card">
        <ul>
          <li>A importação pode ser repetida: registros iguais ficam como estão e nada é duplicado (cada item tem um ID único).</li>
          <li>Aplicações criadas ou editadas pela oficina <strong>nunca são sobrescritas</strong>; aparecem como “ignorar”.</li>
          <li>Os códigos são guardados exatamente como no arquivo (espaços, barras, letras e zeros).</li>
          <li>Tudo entra como compatibilidade de catálogo, não como confirmado no equipamento. {CATALOG_ALERT}</li>
        </ul>
        {user.role === 'admin' ? <CatalogImport /> : <p className="alert alert-warn">Somente administradores importam o catálogo.</p>}
      </section>
    </>
  );
}
