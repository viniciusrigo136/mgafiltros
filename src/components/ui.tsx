// Componentes de apresentação (servidor).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { STATUS_LABEL, ALERT_THRESHOLDS, type MaintenanceStatus, type StatusResult } from '@/lib/status';
import { formatDate, formatHours, whatsappUrl } from '@/lib/format';
import { WO_STATUS_LABEL, type WoStatus } from '@/lib/orders';
import { fillTemplate, type AppSettings } from '@/lib/settings';

export function Brand({ large = false }: { large?: boolean }) {
  return (
    <span className={large ? 'brand brand-lg' : 'brand'}>
      <svg className="brand-gear" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
      </svg>
      <span className="brand-text">
        <span className="brand-mga">MGA</span>
        <span className="brand-sub">Mecânica Agrícola</span>
      </span>
    </span>
  );
}

export function StatusBadge({ status }: { status: MaintenanceStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function OrderBadge({ status }: { status: WoStatus }) {
  return <span className={`badge badge-${status}`}>{WO_STATUS_LABEL[status]}</span>;
}

/** Motivo resumido do alerta, para listas. */
export function statusReason(st: StatusResult): string {
  if (st.reasons.length) return st.reasons.join(', ');
  if (st.status === 'sem_dados') return `Verificar cadastro: falta ${st.missing.join(', ')}`;
  const parts: string[] = [];
  if (st.hoursRemaining != null) parts.push(`faltam ${formatHours(st.hoursRemaining)}`);
  if (st.daysRemaining != null) parts.push(`faltam ${st.daysRemaining} dias`);
  return parts.join(', ');
}

export function ReadingInfo({ st, readAt, staleDays = ALERT_THRESHOLDS.staleReadingDays }: { st: StatusResult; readAt: string | null; staleDays?: number }) {
  if (!readAt) return <span className="muted">sem leitura do horímetro</span>;
  const stale = st.readingAgeDays != null && st.readingAgeDays > staleDays;
  return (
    <span className={stale ? 'stale' : 'muted'}>
      leitura de {formatDate(readAt)}
      {st.readingAgeDays ? ` (há ${st.readingAgeDays} dias)` : ' (hoje)'}
      {stale ? ', desatualizada' : ''}
    </span>
  );
}

/** Link "Avisar cliente": abre o WhatsApp com a mensagem pronta; nada é enviado automaticamente. */
export function NotifyLink({ phone, settings, vars, className = 'btn btn-wa' }: {
  phone: string | null;
  settings: AppSettings;
  vars: { cliente: string; numero: number; trator: string; situacao: string; motivo: string };
  className?: string;
}) {
  const base = whatsappUrl(phone);
  if (!base) return null;
  const text = fillTemplate(settings.whatsappTemplate, { ...vars, oficina: settings.shopName });
  return (
    <a className={className} href={`${base}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
      Avisar cliente
    </a>
  );
}

export function Flash({ ok, erro }: { ok?: string; erro?: string }) {
  return (
    <>
      {ok ? <p className="alert alert-ok" role="status">{ok}</p> : null}
      {erro ? <p className="alert alert-error" role="alert">{erro}</p> : null}
    </>
  );
}

export function PageHead({ title, children, back }: { title: ReactNode; children?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="page-head">
      <div>
        {back && <Link href={back.href} className="back">← {back.label}</Link>}
        <h1>{title}</h1>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Tabs({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="tabs" aria-label="Seções">
      {items.map((i) => (
        <Link key={i.key} href={i.href} className={i.key === active ? 'active' : undefined} aria-current={i.key === active ? 'page' : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}
