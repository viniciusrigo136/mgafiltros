// Formatação e normalização para exibição (pt-BR).

export const FILTER_TYPES = ['oleo', 'combustivel', 'ar', 'hidraulico', 'outros'] as const;
export type FilterType = (typeof FILTER_TYPES)[number];
export const FILTER_TYPE_LABEL: Record<FilterType, string> = {
  oleo: 'Óleo',
  combustivel: 'Combustível',
  ar: 'Ar',
  hidraulico: 'Hidráulico',
  outros: 'Outros',
};
export function filterTypeLabel(t: string): string {
  return FILTER_TYPE_LABEL[t as FilterType] ?? t;
}

/** Só dígitos. Mantém 10/11 dígitos nacionais (DDD + número); remove DDI 55 se informado. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

export function formatPhone(d: string | null): string {
  if (!d) return '';
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

export function whatsappUrl(d: string | null): string | null {
  return d ? `https://wa.me/55${d}` : null;
}

/** YYYY-MM-DD -> DD/MM/AAAA, sem conversão de fuso (evita "dia anterior"). */
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
export function formatNumber(n: number | null | undefined): string {
  return n == null ? '—' : num.format(n);
}
export function formatHours(n: number | null | undefined): string {
  return n == null ? '—' : `${num.format(n)} h`;
}
