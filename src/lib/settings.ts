// Configurações da oficina (tabela settings, valores em JSON).
import { cache } from 'react';
import { getDb, transaction } from './db';
import { ALERT_THRESHOLDS, type Thresholds } from './status';

export interface AppSettings {
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  shopDocument: string;
  thresholds: Thresholds;
  /** Itens padrão do checklist de novas ordens de serviço. */
  checklist: string[];
  /** Mensagem do botão "Avisar cliente". Variáveis: {cliente} {numero} {trator} {situacao} {motivo} {oficina}. */
  whatsappTemplate: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  shopName: 'MGA Mecânica Agrícola',
  shopPhone: '',
  shopAddress: '',
  shopDocument: '',
  thresholds: ALERT_THRESHOLDS,
  checklist: [
    'Nível de óleo do motor',
    'Vazamentos aparentes',
    'Nível do líquido de arrefecimento',
    'Estado das correias',
    'Filtro de ar',
    'Pressão e estado dos pneus',
    'Luzes e painel',
    'Teste de funcionamento',
  ],
  whatsappTemplate:
    'Olá, {cliente}! Aqui é da {oficina}. O trator nº {numero} ({trator}) está com a troca de óleo {situacao}: {motivo}. Podemos agendar?',
};

/** Lida uma vez por requisição. */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await (await getDb()).all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s: AppSettings = { ...DEFAULT_SETTINGS, thresholds: { ...DEFAULT_SETTINGS.thresholds } };
  for (const { key, value } of rows) {
    if (!(key in s)) continue;
    try {
      (s as unknown as Record<string, unknown>)[key] = JSON.parse(value);
    } catch {
      // valor corrompido: mantém o padrão
    }
  }
  return s;
});

export async function saveSettings(partial: Partial<AppSettings>) {
  await transaction(async (tx) => {
    for (const [k, v] of Object.entries(partial)) {
      await tx.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', k, JSON.stringify(v));
    }
  });
}

export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
