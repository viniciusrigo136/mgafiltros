import { notFound } from 'next/navigation';
import { getTractor, getTractorFilters, listOwnerOptions } from '@/lib/data';
import { TractorForm } from '@/components/TractorForm';
import { PageHead } from '@/components/ui';

export default async function EditarTrator({ params }: { params: Promise<{ id: string }> }) {
  const tractor = await getTractor(Number((await params).id));
  if (!tractor) notFound();
  const owners = await listOwnerOptions();
  // Mantém o proprietário atual na lista mesmo se estiver inativo.
  if (!owners.some((o) => o.id === tractor.owner_id)) owners.unshift({ id: tractor.owner_id, name: tractor.owner_name });
  return (
    <>
      <PageHead title={`Editar trator nº ${tractor.sequential_number}`} back={{ href: `/tratores/${tractor.id}`, label: 'Ficha do trator' }} />
      <section className="card">
        <p className="muted">Para alterar o horímetro, use “Atualizar horímetro” na ficha.</p>
        <TractorForm tractor={tractor} filters={await getTractorFilters(tractor.id)} owners={owners} />
      </section>
    </>
  );
}
