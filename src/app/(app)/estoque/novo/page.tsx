import type { Metadata } from 'next';
import { StockForm } from '@/components/StockForm';
import { PageHead } from '@/components/ui';

export const metadata: Metadata = { title: 'Novo item de estoque' };

export default function NovoItem() {
  return (
    <>
      <PageHead title="Novo item de estoque" back={{ href: '/estoque', label: 'Estoque' }} />
      <section className="card"><StockForm /></section>
    </>
  );
}
