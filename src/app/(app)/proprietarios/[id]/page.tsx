import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOwner, listOilChanges, listTractors, sortByUrgency } from '@/lib/data';
import { deleteOwner, setOwnerActive } from '@/lib/actions';
import { formatHours, formatPhone, whatsappUrl } from '@/lib/format';
import { ConfirmButton } from '@/components/ConfirmButton';
import { OilChangeList } from '@/components/OilChangeList';
import { Empty, Flash, PageHead, StatusBadge, one, statusReason, type SearchParams } from '@/components/ui';

export default async function Proprietario({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const owner = await getOwner(Number((await params).id));
  if (!owner) notFound();
  const sp = await searchParams;
  const tractors = sortByUrgency(await listTractors({ ownerId: owner.id, includeInactive: true }));
  const changes = await listOilChanges({ ownerId: owner.id, limit: 50 });
  const wa = whatsappUrl(owner.phone);

  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <PageHead
        title={<>{owner.name} {!owner.is_active && <span className="badge badge-inativo">Inativo</span>}</>}
        back={{ href: '/proprietarios', label: 'Proprietários' }}
      >
        {wa && <a className="btn btn-wa" href={wa} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>}
        <Link className="btn" href={`/proprietarios/${owner.id}/editar`}>Editar</Link>
      </PageHead>

      <div className="grid grid-3-1">
        <section className="card">
          <h2>
            Tratores ({tractors.length})
            {owner.is_active ? <Link className="btn btn-sm btn-primary" href={`/tratores/novo?proprietario=${owner.id}`}>+ Trator</Link> : null}
          </h2>
          {tractors.length === 0 ? (
            <Empty>Nenhum trator vinculado.</Empty>
          ) : (
            <ul className="list">
              {tractors.map((t) => (
                <li key={t.id}>
                  <Link href={`/tratores/${t.id}`} className="item">
                    <span className="plate">{t.sequential_number}</span>
                    <span className="item-body">
                      <span className="item-title">{t.brand} {t.model}{t.year ? ` (${t.year})` : ''}</span>
                      <span className="item-sub">
                        {formatHours(t.current_hours)} · {statusReason(t.st)}
                      </span>
                    </span>
                    {t.is_active ? <StatusBadge status={t.st.status} /> : <span className="badge badge-inativo">Inativo</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Dados</h2>
          <dl className="kv">
            <dt>Telefone</dt><dd>{formatPhone(owner.phone) || '—'}</dd>
            <dt>Município</dt><dd>{owner.city || '—'}</dd>
            <dt>Observações</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{owner.notes || '—'}</dd>
          </dl>
          <div className="inline-forms" style={{ marginTop: '1rem' }}>
            <form action={setOwnerActive}>
              <input type="hidden" name="id" value={owner.id} />
              <input type="hidden" name="active" value={owner.is_active ? '0' : '1'} />
              {owner.is_active ? (
                <ConfirmButton className="btn btn-danger" message="Inativar este proprietário? Os dados e o histórico são mantidos.">Inativar</ConfirmButton>
              ) : (
                <button className="btn" type="submit">Reativar</button>
              )}
            </form>
            {owner.tractor_count === 0 && (
              <form action={deleteOwner}>
                <input type="hidden" name="id" value={owner.id} />
                <ConfirmButton className="btn btn-danger" message="Excluir definitivamente este proprietário (sem tratores vinculados)?">Excluir</ConfirmButton>
              </form>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <h2>Histórico de trocas dos tratores</h2>
        <OilChangeList changes={changes} showTractor />
      </section>
    </>
  );
}
