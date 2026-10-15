// Exportação CSV (abre no Excel). Tipos: proprietarios, tratores, trocas, servicos, estoque, ordens.
import { getCurrentUser } from '@/lib/auth';
import { toCsv } from '@/lib/csv';
import { listOilChanges, listOwners, listTractors } from '@/lib/data';
import { listRecords } from '@/lib/maintenance';
import { listStock } from '@/lib/stock';
import { WO_STATUS_LABEL, listOrders } from '@/lib/orders';
import { orderTotals } from '@/lib/money';
import { STATUS_LABEL, todayInTimeZone } from '@/lib/status';
import { filterTypeLabel } from '@/lib/format';

type Table = { headers: string[]; rows: (string | number | null)[][] };

const EXPORTS: Record<string, () => Table> = {
  proprietarios: () => ({
    headers: ['id', 'nome', 'telefone', 'municipio', 'observacoes', 'ativo', 'tratores'],
    rows: listOwners({ includeInactive: true }).map((o) => [o.id, o.name, o.phone, o.city, o.notes, o.is_active ? 'sim' : 'não', o.tractor_count]),
  }),
  tratores: () => ({
    headers: ['numero', 'proprietario', 'marca', 'modelo', 'ano', 'serie', 'horimetro', 'data_leitura', 'oleo', 'litros',
      'intervalo_horas', 'intervalo_meses', 'ultima_troca', 'horimetro_ultima_troca', 'proxima_hora', 'proxima_data', 'situacao', 'motivo', 'ativo'],
    rows: listTractors({ includeInactive: true }).map((t) => [
      t.sequential_number, t.owner_name, t.brand, t.model, t.year, t.serial_number, t.current_hours, t.hours_read_at, t.oil_spec,
      t.oil_capacity_liters, t.interval_hours, t.interval_months, t.last_change_date, t.last_change_hours, t.st.nextHours, t.st.nextDate,
      STATUS_LABEL[t.st.status], [...t.st.reasons, ...t.st.missing.map((m) => `falta ${m}`)].join('; '), t.is_active ? 'sim' : 'não',
    ]),
  }),
  trocas: () => ({
    headers: ['data', 'trator', 'marca', 'modelo', 'proprietario', 'horimetro', 'oleo', 'litros', 'filtros', 'responsavel', 'observacoes'],
    rows: listOilChanges({ limit: 500 }).map((c) => [
      c.serviced_at, c.sequential_number, c.brand, c.model, c.owner_name, c.service_hours, c.oil_used, c.liters_used,
      c.filters.map((f) => `${filterTypeLabel(f.filter_type_snapshot)} ${f.reference_code_snapshot} x${f.quantity}`).join(', '),
      c.performed_by, c.notes,
    ]),
  }),
  servicos: () => ({
    headers: ['data', 'tipo', 'trator', 'marca', 'modelo', 'proprietario', 'horimetro', 'produto', 'quantidade', 'responsavel', 'observacoes'],
    rows: listRecords({ limit: 500 }).map((r) => [
      r.serviced_at, r.type_name, r.sequential_number, r.brand, r.model, r.owner_name, r.service_hours, r.product_used, r.quantity, r.performed_by, r.notes,
    ]),
  }),
  estoque: () => ({
    headers: ['tipo', 'codigo', 'descricao', 'fabricante', 'unidade', 'saldo', 'minimo', 'custo', 'venda', 'local', 'ativo'],
    rows: listStock({ includeInactive: true }).map((s) => [
      s.kind, s.reference_code, s.description, s.manufacturer, s.unit, s.balance, s.min_quantity, s.cost_price, s.sale_price, s.location, s.is_active ? 'sim' : 'não',
    ]),
  }),
  ordens: () => ({
    headers: ['numero', 'abertura', 'conclusao', 'situacao', 'trator', 'proprietario', 'solicitacao', 'bruto', 'desconto', 'total'],
    rows: listOrders({ limit: 500 }).map((o) => [
      o.number, o.opened_at, o.closed_at, WO_STATUS_LABEL[o.status], o.sequential_number, o.owner_name, o.complaint,
      o.gross, o.discount, orderTotals([{ kind: 'peca', quantity: 1, unit_price: o.gross }], o.discount).total,
    ]),
  }),
};

export async function GET(_: Request, { params }: { params: Promise<{ tipo: string }> }) {
  if (!(await getCurrentUser())) return new Response('Não autorizado', { status: 401 });
  const { tipo } = await params;
  const build = EXPORTS[tipo];
  if (!build) return new Response('Exportação desconhecida', { status: 404 });
  const { headers, rows } = build();
  return new Response(toCsv(headers, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mga-${tipo}-${todayInTimeZone()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
