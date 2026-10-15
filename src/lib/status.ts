// Regras de vencimento da troca de óleo. Módulo puro (sem I/O) para ser testável.

/** Limiares de aviso — altere aqui para mudar em todo o sistema. */
export interface Thresholds { hours: number; days: number; staleReadingDays: number }

/** Limiares padrão — podem ser alterados na tela Configurações. */
export const ALERT_THRESHOLDS: Thresholds = {
  /** "Próxima" quando faltarem até N horas. */
  hours: 20,
  /** "Próxima" quando faltarem até N dias. */
  days: 15,
  /** Leitura do horímetro mais antiga que N dias é destacada como desatualizada. */
  staleReadingDays: 30,
};

export const TIME_ZONE = 'America/Sao_Paulo';

export type MaintenanceStatus = 'vencida' | 'proxima' | 'em_dia' | 'sem_dados';

export const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  vencida: 'Vencida',
  proxima: 'Próxima',
  em_dia: 'Em dia',
  sem_dados: 'Sem dados',
};

export interface StatusInput {
  intervalHours: number | null;
  intervalMonths: number | null;
  lastChange: { date: string; hours: number } | null;
  currentHours: number | null;
  hoursReadAt: string | null;
  /** Data de hoje (YYYY-MM-DD) no fuso da oficina. */
  today: string;
  thresholds?: Thresholds;
  /** Como chamar o último serviço na lista do que falta (padrão: última troca de óleo). */
  lastLabel?: string;
}

export interface StatusResult {
  status: MaintenanceStatus;
  nextHours: number | null;
  nextDate: string | null;
  hoursRemaining: number | null;
  daysRemaining: number | null;
  /** Dias desde a última leitura do horímetro. */
  readingAgeDays: number | null;
  /** Critérios que geraram o alerta (vencida/próxima). */
  reasons: string[];
  /** O que falta cadastrar para o cálculo ficar completo. */
  missing: string[];
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Valida uma data YYYY-MM-DD real (rejeita 2025-02-30). */
export function isValidIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function toUtc(date: string): Date {
  const m = ISO_DATE.exec(date);
  if (!m) throw new Error(`Data inválida: ${date}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Data de hoje no fuso da oficina, independente do fuso do servidor. */
export function todayInTimeZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now);
}

/** Soma meses de calendário; o dia é limitado ao fim do mês (31/01 + 1 mês = 28/02 ou 29/02). */
export function addMonths(date: string, months: number): string {
  const d = toUtc(date);
  const y = d.getUTCFullYear();
  const targetMonth = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  return fromUtc(new Date(Date.UTC(y, targetMonth, Math.min(d.getUTCDate(), lastDay))));
}

/** Diferença em dias (to - from). */
export function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export function computeStatus(input: StatusInput): StatusResult {
  const { intervalHours, intervalMonths, lastChange, currentHours, hoursReadAt, today } = input;
  const limits = input.thresholds ?? ALERT_THRESHOLDS;
  const missing: string[] = [];
  const reasons: string[] = [];

  const hasHours = intervalHours != null && intervalHours > 0;
  const hasMonths = intervalMonths != null && intervalMonths > 0;
  if (!hasHours && !hasMonths) missing.push('intervalo de troca (horas e/ou meses)');
  if (!lastChange) missing.push(input.lastLabel ?? 'última troca de óleo');
  if (hasHours && currentHours == null) missing.push('leitura do horímetro');

  const readingAgeDays = hoursReadAt ? diffDays(hoursReadAt, today) : null;

  let nextHours: number | null = null;
  let hoursRemaining: number | null = null;
  let nextDate: string | null = null;
  let daysRemaining: number | null = null;

  if (lastChange && hasHours) {
    nextHours = lastChange.hours + intervalHours!;
    if (currentHours != null) hoursRemaining = nextHours - currentHours;
  }
  if (lastChange && hasMonths) {
    nextDate = addMonths(lastChange.date, intervalMonths!);
    daysRemaining = diffDays(today, nextDate);
  }

  const result = (status: MaintenanceStatus): StatusResult => ({
    status, nextHours, nextDate, hoursRemaining, daysRemaining, readingAgeDays, reasons, missing,
  });

  // Regra OU: vence pelo primeiro critério atingido.
  if (hoursRemaining != null && hoursRemaining <= 0) reasons.push(`horímetro atingiu ${fmt(nextHours!)} h`);
  if (daysRemaining != null && daysRemaining <= 0) reasons.push(`prazo de ${intervalMonths} meses venceu`);
  if (reasons.length) return result('vencida');

  if (hoursRemaining != null && hoursRemaining <= limits.hours) reasons.push(`faltam ${fmt(hoursRemaining)} h`);
  if (daysRemaining != null && daysRemaining <= limits.days) reasons.push(`faltam ${daysRemaining} dias`);
  if (reasons.length) return result('proxima');

  // Sem alerta, mas com dado faltando: não dar falsa segurança.
  if (missing.length) return result('sem_dados');
  return result('em_dia');
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const PRIORITY: Record<MaintenanceStatus, number> = { vencida: 0, proxima: 1, sem_dados: 2, em_dia: 3 };

/** Ordena por urgência: vencidas, próximas, sem dados, em dia; depois pelo menor prazo restante. */
export function compareUrgency(a: StatusResult, b: StatusResult): number {
  const p = PRIORITY[a.status] - PRIORITY[b.status];
  if (p !== 0) return p;
  return urgencyScore(a) - urgencyScore(b);
}

function urgencyScore(r: StatusResult): number {
  // Aproximação para desempate: 1 dia ~ 1 hora de uso.
  const values = [r.hoursRemaining, r.daysRemaining].filter((v): v is number => v != null);
  return values.length ? Math.min(...values) : Number.POSITIVE_INFINITY;
}

/**
 * Uso médio em horas/dia a partir das leituras do horímetro (janela de até 365 dias).
 * Retorna null sem base suficiente (menos de 7 dias entre leituras ou sem avanço).
 */
export function usageRate(readings: { hours: number; read_at: string }[], today: string): number | null {
  const recent = readings.filter((r) => diffDays(r.read_at, today) <= 365);
  if (recent.length < 2) return null;
  let first = recent[0];
  let last = recent[0];
  for (const r of recent) {
    if (r.read_at < first.read_at) first = r;
    if (r.read_at > last.read_at) last = r;
  }
  const days = diffDays(first.read_at, last.read_at);
  const hours = last.hours - first.hours;
  if (days < 7 || hours <= 0) return null;
  return hours / days;
}

/** Data estimada para atingir o limite de horas, contando a partir da data da última leitura. */
export function estimateHoursDueDate(hoursRemaining: number | null, ratePerDay: number | null, lastReadAt: string | null): string | null {
  if (hoursRemaining == null || ratePerDay == null || ratePerDay <= 0 || !lastReadAt) return null;
  return addDays(lastReadAt, Math.max(0, Math.ceil(hoursRemaining / ratePerDay)));
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}
