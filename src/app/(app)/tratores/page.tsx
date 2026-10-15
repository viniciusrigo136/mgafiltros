import type { Metadata } from 'next';
import Link from 'next/link';
import { listTractors, sortByUrgency } from '@/lib/data';
import { formatHours } from '@/lib/format';
import { STATUS_LABEL, type MaintenanceStatus } from '@/lib/status';
import { Empty, Flash, PageHead, StatusBadge, one, statusReason, type SearchParams } from '@/components/ui';

export const metadata: Metadata = { title: 'Tratores' };

const STATUSES = Object.keys(STATUS_LABEL) as MaintenanceStatus[];

export default async function Tratores({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const raw = one(sp.situacao);
  const situacao = (STATUSES as string[]).includes(raw) ? (raw as MaintenanceStatus) : '';
  const ordem = one(sp.ordem) === 'numero' ? 'numero' : 'urgencia';
  const inativos = one(sp.inativos) === '1';
  let tractors = listTractors({ q, status: situacao, includeInactive: inativos });
  if (ordem === 'urgencia') tractors = sortByUrgency(tractors);

  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <PageHead title="Tratores">
        <Link className="btn btn-primary" href="/tratores/novo">+ Novo trator</Link>
      </PageHead>
      <form className="toolbar" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Nº, proprietário, marca, modelo ou código de filtro" aria-label="Buscar trator" />
        <select name="situacao" defaultValue={situacao} aria-label="Situação">
          <option value="">Todas as situações</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select name="ordem" defaultValue={ordem} aria-label="Ordenação">
          <option value="urgencia">Mais urgentes primeiro</option>
          <option value="numero">Por número</option>
        </select>
        <label className="check"><input type="checkbox" name="inativos" value="1" defaultChecked={inativos} /> Inativos</label>
        <button className="btn" type="submit">Filtrar</button>
      </form>
      {tractors.length === 0 ? (
        <Empty>
          {q || situacao ? 'Nenhum trator encontrado com esses filtros.' : <>Nenhum trator cadastrado. <Link href="/tratores/novo">Cadastrar</Link>.</>}
        </Empty>
      ) : (
        <ul className="list">
          {tractors.map((t) => (
            <li key={t.id}>
              <Link href={`/tratores/${t.id}`} className="item">
                <span className="plate">{t.sequential_number}</span>
                <span className="item-body">
                  <span className="item-title">{t.brand} {t.model} · {t.owner_name}</span>
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
    </>
  );
}
