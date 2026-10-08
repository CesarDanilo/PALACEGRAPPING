import { describe, expect, it } from 'vitest';
import { can, canAssignRole } from '../../src/domain/access/permissions.js';
import { linkUnavailableReason } from '../../src/domain/catalog/catalog-link.js';
import { assertTransition, canTransition, releasesStock } from '../../src/domain/orders/order-status.js';
import { canMovePayment } from '../../src/domain/payments/payment-status.js';
import { computeTotals, effectiveUnitPrice, shippingFor } from '../../src/domain/pricing/pricing.js';
import { pricingProblem, slugify, variantLabel } from '../../src/domain/products/product-rules.js';
import { cents, parseDecimal, toDecimalString } from '../../src/shared/money.js';

describe('money', () => {
  it('converte decimais sem ponto flutuante', () => {
    expect(parseDecimal('199.90')).toBe(19990);
    expect(parseDecimal('0.1')).toBe(10);
    expect(parseDecimal('12')).toBe(1200);
    expect(parseDecimal('-3.05')).toBe(-305);
    expect(toDecimalString(cents(19990))).toBe('199.90');
    expect(toDecimalString(cents(-5))).toBe('-0.05');
  });

  it('rejeita mais de duas casas significativas e valores não inteiros', () => {
    expect(() => parseDecimal('1.005')).toThrow();
    expect(() => cents(1.5)).toThrow();
  });

  it('soma 0,1 + 0,2 exatamente', () => {
    const totals = computeTotals(
      [
        { unitPrice: cents(10), quantity: 1 },
        { unitPrice: cents(20), quantity: 1 },
      ],
      { mode: 'FREE' },
    );
    expect(totals.total).toBe(30);
  });
});

describe('pricing', () => {
  const product = { price: cents(10000), salePrice: cents(8000) };

  it('usa o promocional do produto quando a variante não sobrepõe preço', () => {
    expect(effectiveUnitPrice(product, { price: null, salePrice: null })).toBe(8000);
  });

  it('variante com preço próprio ignora o promocional do produto', () => {
    expect(effectiveUnitPrice(product, { price: cents(12000), salePrice: null })).toBe(12000);
    expect(effectiveUnitPrice(product, { price: cents(12000), salePrice: cents(11000) })).toBe(11000);
  });

  it('ignora promocional maior ou igual ao preço', () => {
    expect(effectiveUnitPrice({ price: cents(5000), salePrice: cents(6000) }, {})).toBe(5000);
  });

  it('aplica frete fixo e frete grátis acima do limite', () => {
    const rule = { mode: 'FLAT_RATE' as const, flatRate: cents(2990), freeShippingThreshold: cents(49900) };
    expect(shippingFor(rule, cents(10000))).toBe(2990);
    expect(shippingFor(rule, cents(49900))).toBe(0);
    expect(computeTotals([{ unitPrice: cents(10000), quantity: 2 }], rule)).toEqual({ subtotal: 20000, shipping: 2990, discount: 0, total: 22990 });
  });
});

describe('regras de produto', () => {
  it('valida preço promocional', () => {
    expect(pricingProblem({ price: cents(1000), salePrice: cents(1000) })).toMatch(/menor/);
    expect(pricingProblem({ price: cents(1000), salePrice: cents(900) })).toBeNull();
  });
  it('gera slug e rótulo de variante', () => {
    expect(slugify('Kimono Ação Nº 1 — Preto')).toBe('kimono-acao-n-1-preto');
    expect(variantLabel({ size: 'A2', color: 'Preto' })).toBe('A2 / Preto');
    expect(variantLabel({ size: null, color: null })).toBe('Único');
  });
});

describe('máquina de estados do pedido', () => {
  it('permite o fluxo feliz e bloqueia saltos', () => {
    expect(canTransition('PENDING_PAYMENT', 'PAID')).toBe(true);
    expect(canTransition('PAID', 'SHIPPED')).toBe(false);
    expect(canTransition('DELIVERED', 'CANCELLED')).toBe(false);
    expect(() => assertTransition('CANCELLED', 'PAID')).toThrow(/não pode passar/);
  });

  it('devolve estoque só em cancelamento/expiração antes do envio', () => {
    expect(releasesStock('PENDING_PAYMENT', 'EXPIRED')).toBe(true);
    expect(releasesStock('PAID', 'CANCELLED')).toBe(true);
    expect(releasesStock('SHIPPED', 'RETURNED')).toBe(false);
  });
});

describe('estado de pagamento', () => {
  it('ignora regressões e permite estorno após aprovação', () => {
    expect(canMovePayment('APPROVED', 'PENDING')).toBe(false);
    expect(canMovePayment('APPROVED', 'REFUNDED')).toBe(true);
    expect(canMovePayment('REJECTED', 'APPROVED')).toBe(true);
    expect(canMovePayment('EXPIRED', 'APPROVED')).toBe(false);
  });
});

describe('links exclusivos', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const base = { isActive: true, expiresAt: null, maxUses: null, useCount: 0, catalog: { isActive: true, startsAt: null, endsAt: null } };

  it('valida atividade, expiração, limite e janela do catálogo', () => {
    expect(linkUnavailableReason(base, now)).toBeNull();
    expect(linkUnavailableReason({ ...base, isActive: false }, now)).toBe('INACTIVE');
    expect(linkUnavailableReason({ ...base, expiresAt: new Date('2026-10-08T11:59:59Z') }, now)).toBe('EXPIRED');
    expect(linkUnavailableReason({ ...base, maxUses: 2, useCount: 2 }, now)).toBe('USAGE_LIMIT');
    expect(linkUnavailableReason({ ...base, catalog: { isActive: true, startsAt: new Date('2026-10-09T00:00:00Z'), endsAt: null } }, now)).toBe('CATALOG_UNAVAILABLE');
  });
});

describe('permissões', () => {
  it('separa operador, administrador e proprietário', () => {
    expect(can('OPERATOR', 'orders:write')).toBe(true);
    expect(can('OPERATOR', 'catalog:write')).toBe(false);
    expect(can('OPERATOR', 'finance:read')).toBe(false);
    expect(can('ADMIN', 'finance:write')).toBe(true);
    expect(can('ADMIN', 'members:manage')).toBe(false);
    expect(can('OWNER', 'members:manage')).toBe(true);
    expect(canAssignRole('ADMIN', 'OPERATOR')).toBe(false);
  });
});
