import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getModel } from '@/lib/models';
import { deleteModel } from '@/lib/actions-models';
import { requireUser } from '@/lib/auth';
import { ConfirmButton } from '@/components/ConfirmButton';
import { ModelForm } from '@/components/ModelForm';
import { Flash, PageHead, one, type SearchParams } from '@/components/ui';

export default async function Modelo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const model = getModel(Number(id));
  if (!model) notFound();
  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <PageHead title={`${model.brand} ${model.model}`} back={{ href: '/modelos', label: 'Modelos' }}>
        <Link className="btn btn-primary" href={`/tratores/novo?modelo=${model.id}`}>Cadastrar trator deste modelo</Link>
      </PageHead>
      <section className="card"><ModelForm model={model} filters={model.filters} /></section>
      {user.role === 'admin' && (
        <form action={deleteModel}>
          <input type="hidden" name="id" value={model.id} />
          <ConfirmButton className="btn btn-danger" message="Excluir este modelo? Tratores já cadastrados não mudam.">Excluir modelo</ConfirmButton>
        </form>
      )}
    </>
  );
}
