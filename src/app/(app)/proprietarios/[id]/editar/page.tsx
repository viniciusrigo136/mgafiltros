import { notFound } from 'next/navigation';
import { getOwner } from '@/lib/data';
import { OwnerForm } from '@/components/OwnerForm';
import { PageHead } from '@/components/ui';

export default async function EditarProprietario({ params }: { params: Promise<{ id: string }> }) {
  const owner = await getOwner(Number((await params).id));
  if (!owner) notFound();
  return (
    <>
      <PageHead title={`Editar ${owner.name}`} back={{ href: `/proprietarios/${owner.id}`, label: owner.name }} />
      <section className="card"><OwnerForm owner={owner} /></section>
    </>
  );
}
