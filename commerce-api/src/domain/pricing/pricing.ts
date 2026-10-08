import { type Cents, multiply, sum, ZERO } from '../../shared/money.js';

// Cálculo de valores do pedido. Puro: recebe preços já lidos do banco e nunca
// aceita preços vindos do cliente.

export interface PriceSource {
  price: Cents;
  salePrice: Cents | null;
}

/** Preço efetivo de uma variante: a variante sobrepõe o produto; o promocional vale se for menor. */
export function effectiveUnitPrice(product: PriceSource, variant: { price?: Cents | null; salePrice?: Cents | null }): Cents {
  const base = variant.price ?? product.price;
  const sale = variant.price != null ? (variant.salePrice ?? null) : (variant.salePrice ?? product.salePrice);
  return sale != null && sale < base ? sale : base;
}

export type ShippingRule =
  | { mode: 'FREE' }
  | { mode: 'FLAT_RATE'; flatRate: Cents; freeShippingThreshold: Cents | null };

export function shippingFor(rule: ShippingRule, subtotal: Cents): Cents {
  if (rule.mode === 'FREE') return ZERO;
  if (rule.freeShippingThreshold != null && subtotal >= rule.freeShippingThreshold) return ZERO;
  return rule.flatRate;
}

export interface PricedLine {
  unitPrice: Cents;
  quantity: number;
}

export interface Totals {
  subtotal: Cents;
  shipping: Cents;
  discount: Cents;
  total: Cents;
}

export function computeTotals(lines: PricedLine[], rule: ShippingRule, discount: Cents = ZERO): Totals {
  const subtotal = sum(lines.map((l) => multiply(l.unitPrice, l.quantity)));
  const shipping = lines.length === 0 ? ZERO : shippingFor(rule, subtotal);
  const appliedDiscount = Math.min(discount, subtotal) as Cents;
  const total = sum([subtotal, shipping, (-appliedDiscount) as Cents]);
  return { subtotal, shipping, discount: appliedDiscount, total };
}
