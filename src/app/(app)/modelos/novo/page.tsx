import type { Metadata } from 'next';
import { ModelForm } from '@/components/ModelForm';
import { PageHead } from '@/components/ui';

export const metadata: Metadata = { title: 'Novo modelo' };

export default function NovoModelo() {
  return (
    <>
      <PageHead title="Novo modelo de trator" back={{ href: '/modelos', label: 'Modelos' }} />
      <section className="card"><ModelForm /></section>
    </>
  );
}
