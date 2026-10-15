import type { Metadata } from 'next';
import { OwnerForm } from '@/components/OwnerForm';
import { PageHead } from '@/components/ui';

export const metadata: Metadata = { title: 'Novo proprietário' };

export default function NovoProprietario() {
  return (
    <>
      <PageHead title="Novo proprietário" back={{ href: '/proprietarios', label: 'Proprietários' }} />
      <section className="card"><OwnerForm /></section>
    </>
  );
}
