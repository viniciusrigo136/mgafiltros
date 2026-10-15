// Leitura e validação de campos de formulário no servidor.
import { isValidIsoDate } from './status.ts';

export class ValidationError extends Error {}

export function text(fd: FormData, key: string, label: string, opts: { required?: boolean; max?: number } = {}): string | null {
  const v = String(fd.get(key) ?? '').trim();
  if (!v) {
    if (opts.required) throw new ValidationError(`Preencha: ${label}.`);
    return null;
  }
  if (v.length > (opts.max ?? 500)) throw new ValidationError(`${label}: texto muito longo.`);
  return v;
}

export function number(
  fd: FormData, key: string, label: string,
  opts: { required?: boolean; min?: number; max?: number; integer?: boolean; positive?: boolean } = {},
): number | null {
  const raw = String(fd.get(key) ?? '').trim().replace(/\s/g, '');
  if (!raw) {
    if (opts.required) throw new ValidationError(`Preencha: ${label}.`);
    return null;
  }
  // Aceita "1.234,5" e "1234.5".
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const n = Number(normalized);
  if (!Number.isFinite(n)) throw new ValidationError(`${label}: número inválido.`);
  if (n < (opts.min ?? 0)) throw new ValidationError(`${label}: não pode ser negativo.`);
  if (opts.positive && n <= 0) throw new ValidationError(`${label}: deve ser maior que zero.`);
  if (opts.max != null && n > opts.max) throw new ValidationError(`${label}: valor acima do permitido.`);
  if (opts.integer && !Number.isInteger(n)) throw new ValidationError(`${label}: use número inteiro.`);
  return n;
}

export function date(fd: FormData, key: string, label: string, opts: { required?: boolean; notAfter?: string } = {}): string | null {
  const v = String(fd.get(key) ?? '').trim();
  if (!v) {
    if (opts.required) throw new ValidationError(`Preencha: ${label}.`);
    return null;
  }
  if (!isValidIsoDate(v)) throw new ValidationError(`${label}: data inválida.`);
  if (opts.notAfter && v > opts.notAfter) throw new ValidationError(`${label}: não pode ser no futuro.`);
  return v;
}

export function id(fd: FormData, key: string, label: string): number {
  const n = Number(fd.get(key));
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`Selecione: ${label}.`);
  return n;
}
