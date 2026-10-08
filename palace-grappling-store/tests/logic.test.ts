import { beforeEach, describe, expect, it } from 'vitest';
import { __resetCart, cart, MAX_QUANTITY } from '@/features/cart/cart-store';
import { addToCartBlock, resolveVariant, unavailableSizes, variantAxes } from '@/features/catalog/variant-selection';
import { checkoutDefaults, checkoutSchema } from '@/features/checkout/checkout-schema';
import type { PublicVariant } from '@/lib/api/types';
import { formatMoney, parseMoneyInput } from '@/lib/money';

const variant = (over: Partial<PublicVariant>): PublicVariant => ({
  id: crypto.randomUUID(),
  sku: 'SKU',
  size: null,
  color: null,
  colorHex: null,
  price: 10000,
  compareAtPrice: null,
  availability: 'ok',
  ...over,
});

describe('dinheiro', () => {
  it('formata centavos em reais', () => {
    expect(formatMoney(19990).replace(/\s/g, ' ')).toBe('R$ 199,90');
  });
  it('converte entrada de formulário para centavos', () => {
    expect(parseMoneyInput('199,90')).toBe(19990);
    expect(parseMoneyInput('1.299,00')).toBe(129900);
    expect(parseMoneyInput('abc')).toBeNull();
  });
});

describe('seleção de variante', () => {
  const kimono = {
    variants: [
      variant({ size: 'A1', color: 'Preto', availability: 'ok' }),
      variant({ size: 'A2', color: 'Preto', availability: 'out' }),
      variant({ size: 'A1', color: 'Branco', availability: 'ok' }),
      variant({ size: 'A2', color: 'Branco', availability: 'low' }),
    ],
  };

  it('exige tamanho e cor quando há escolha', () => {
    expect(variantAxes(kimono)).toMatchObject({ requiresSize: true, requiresColor: true });
    expect(addToCartBlock(kimono, { size: null, color: 'Preto' })).toBe('SELECT_SIZE');
    expect(addToCartBlock(kimono, { size: 'A1', color: null })).toBe('SELECT_COLOR');
    expect(addToCartBlock(kimono, { size: 'A1', color: 'Preto' })).toBeNull();
  });

  it('bloqueia variante esgotada e sinaliza tamanhos indisponíveis por cor', () => {
    expect(addToCartBlock(kimono, { size: 'A2', color: 'Preto' })).toBe('UNAVAILABLE');
    expect([...unavailableSizes(kimono, 'Preto')]).toEqual(['A2']);
    expect([...unavailableSizes(kimono, 'Branco')]).toEqual([]);
  });

  it('cor única não precisa ser escolhida', () => {
    const rash = { variants: [variant({ size: 'P', color: 'Preto' }), variant({ size: 'M', color: 'Preto' })] };
    expect(variantAxes(rash).requiresColor).toBe(false);
    expect(resolveVariant(rash, { size: 'M', color: null })?.size).toBe('M');
  });

  it('produto sem variações de tamanho/cor é comprável direto', () => {
    const bag = { variants: [variant({})] };
    expect(addToCartBlock(bag, { size: null, color: null })).toBeNull();
  });
});

describe('carrinho', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetCart();
  });
  const item = { variantId: 'v1', productSlug: 'p', productName: 'Produto', variantLabel: 'M', imageUrl: null, previewUnitPrice: 100 };

  it('soma quantidades da mesma variante e limita ao máximo', () => {
    cart.add(item, 2);
    cart.add(item, 3);
    expect(cart.get().items).toHaveLength(1);
    expect(cart.get().items[0]!.quantity).toBe(5);
    cart.setQuantity('v1', 999);
    expect(cart.get().items[0]!.quantity).toBe(MAX_QUANTITY);
    cart.setQuantity('v1', 0);
    expect(cart.get().items[0]!.quantity).toBe(1);
  });

  it('persiste no navegador e reinicia ao trocar de contexto (link exclusivo)', () => {
    cart.add(item, 1);
    expect(JSON.parse(localStorage.getItem('pg.cart.v1')!).items).toHaveLength(1);
    cart.add({ ...item, variantId: 'v2' }, 1, { kind: 'link', token: 'tok' });
    expect(cart.get().items.map((i) => i.variantId)).toEqual(['v2']);
    expect(cart.get().context).toEqual({ kind: 'link', token: 'tok' });
  });
});

describe('formulário de checkout', () => {
  const valid = {
    ...checkoutDefaults,
    name: 'Maria Souza',
    phone: '(11) 98888-7777',
    zipCode: '01310-100',
    street: 'Av. Paulista',
    number: '1000',
    district: 'Bela Vista',
    city: 'São Paulo',
    acceptTerms: true,
  };

  it('normaliza telefone e CEP', () => {
    const parsed = checkoutSchema.parse(valid);
    expect(parsed.phone).toBe('11988887777');
    expect(parsed.zipCode).toBe('01310100');
  });

  it('exige aceite dos termos e dados de entrega', () => {
    const result = checkoutSchema.safeParse({ ...valid, acceptTerms: false, zipCode: '123' });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['acceptTerms', 'zipCode']));
  });
});
