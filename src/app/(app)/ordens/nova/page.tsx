import type { Metadata } from 'next';
import Link from 'next/link';
import { createOrder } from '@/lib/actions-orders';
import { getTractor, listTractorOptions } from '@/lib/data';
import { ActionForm } from '@/components/ActionForm';
import { Empty, PageHead, StatusBadge, one, type SearchParams } from '@/components/ui';

export const metadata: Metadata = { title: 'Abrir OS' };

export default async function NovaOrdem({ searchParams }: { searchParams: SearchParams }) {
  const tractorId = Number(one((await searchParams).trator)) || 0;
  const t = tractorId ? await getTractor(tractorId) : null;
  const options = t ? [] : await listTractorOptions();

  return (
    <>
      <PageHead title="Abrir ordem de serviço" back={{ href: '/ordens', label: 'Ordens de serviço' }} />
      <section className="card">
        {!t && options.length === 0 ? (
          <Empty>Nenhum trator ativo. <Link href="/tratores/novo">Cadastrar trator</Link></Empty>
        ) : (
          <ActionForm action={createOrder} submitLabel="Abrir OS">
            {t ? (
              <>
                <input type="hidden" name="tractor_id" value={t.id} />
                <p>
                  <span className="plate" style={{ marginRight: '.6rem' }}>{t.sequential_number}</span>
                  <strong>{t.brand} {t.model}</strong>, {t.owner_name} <StatusBadge status={t.st.status} />
                </p>
              </>
            ) : (
              <label>Trator *
                <select name="tractor_id" required defaultValue="">
                  <option value="" disabled>Selecione o trator…</option>
                  {options.map((o) => <option key={o.id} value={o.id}>Nº {o.sequential_number}: {o.brand} {o.model} ({o.owner_name})</option>)}
                </select>
              </label>
            )}
            <div className="fields" style={{ marginTop: '.85rem' }}>
              <label className="span-2">Solicitação do cliente / problema relatado
                <textarea name="complaint" maxLength={2000} placeholder="ex.: revisão de 250 h, barulho na transmissão…" />
              </label>
              <label className="check span-2">
                <input type="checkbox" name="with_oil" value="1" defaultChecked={t ? t.st.status === 'vencida' || t.st.status === 'proxima' : false} />
                Incluir peças da troca de óleo (filtros e óleo cadastrados no trator, com preço do estoque)
              </label>
            </div>
            <p className="hint">O checklist padrão das Configurações é incluído automaticamente.</p>
          </ActionForm>
        )}
      </section>
    </>
  );
}
