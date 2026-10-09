import { describe, expect, it } from 'vitest';
import { checkoutDefaults, checkoutSchema } from '@/features/checkout/checkout-schema';
import { centsSchema, normalizeBrazilianPhone, passwordSchema, skuSchema, stockSchema, toNumber } from '@/lib/validation';

const valid = {
  ...checkoutDefaults,
  name: 'Ana Souza',
  phone: '(11) 98888-7777',
  zipCode: '01310-100',
  street: 'Av. Paulista',
  number: '1000',
  district: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP' as const,
  acceptTerms: true,
};
const errorsOf = (input: unknown) => {
  const r = checkoutSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('checkout', () => {
  it('aceita um pedido válido e normaliza telefone e CEP', () => {
    const r = checkoutSchema.parse(valid);
    expect(r.phone).toBe('11988887777');
    expect(r.zipCode).toBe('01310100');
  });
  it.each([
    [{ name: 'Ana' }, 'name'],
    [{ name: 'Ana <b>' }, 'name'],
    [{ phone: '(20) 98888-7777' }, 'phone'],
    [{ phone: '11 88888-7777' }, 'phone'],
    [{ zipCode: '0131' }, 'zipCode'],
    [{ state: 'XX' }, 'state'],
    [{ email: 'nao-e-email' }, 'email'],
    [{ notes: 'x'.repeat(501) }, 'notes'],
    [{ acceptTerms: false }, 'acceptTerms'],
  ])('recusa %o', (patch, path) => expect(errorsOf({ ...valid, ...patch })).toContain(path));
});

describe('regras compartilhadas', () => {
  it('telefone com +55 e fixo', () => {
    expect(normalizeBrazilianPhone('+55 21 3333-4444')).toBe('2133334444');
    expect(normalizeBrazilianPhone('21 1333-4444')).toBeNull();
  });
  it('valores e quantidades recusam negativo, fração, NaN e infinito', () => {
    for (const v of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(centsSchema.safeParse(v).success).toBe(false);
      expect(stockSchema.safeParse(v).success).toBe(false);
    }
    expect(stockSchema.safeParse(1_000_001).success).toBe(false);
    expect(toNumber('')).toBeNaN();
    expect(toNumber('12')).toBe(12);
  });
  it('SKU e senha', () => {
    expect(skuSchema.safeParse('KIM-A2').success).toBe(true);
    expect(skuSchema.safeParse('KIM A2').success).toBe(false);
    expect(passwordSchema.safeParse('curta12').success).toBe(false);
    expect(passwordSchema.safeParse('UmaSenhaForte2026').success).toBe(true);
  });
});
