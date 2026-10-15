// Totais de ordem de serviço.

export interface PricedItem { kind: string; quantity: number; unit_price: number }

export function orderTotals(items: PricedItem[], discount = 0) {
  let parts = 0;
  let labor = 0;
  for (const i of items) {
    const v = round2(i.quantity * i.unit_price);
    if (i.kind === 'servico') labor += v;
    else parts += v;
  }
  const subtotal = round2(parts + labor);
  const appliedDiscount = Math.min(round2(discount), subtotal);
  return { parts: round2(parts), labor: round2(labor), subtotal, discount: appliedDiscount, total: round2(subtotal - appliedDiscount) };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatMoney(n: number | null | undefined): string {
  return n == null ? '—' : brl.format(n);
}
