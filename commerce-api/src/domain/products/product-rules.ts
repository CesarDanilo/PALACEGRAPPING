import type { Cents } from '../../shared/money.js';

export interface ProductPricing {
  price: Cents;
  salePrice: Cents | null;
}

/** Preço promocional precisa ser menor que o preço cheio. Retorna mensagem de erro ou null. */
export function pricingProblem({ price, salePrice }: ProductPricing): string | null {
  if (price < 0) return 'Preço não pode ser negativo';
  if (salePrice != null && salePrice < 0) return 'Preço promocional não pode ser negativo';
  if (salePrice != null && salePrice >= price) return 'Preço promocional deve ser menor que o preço';
  return null;
}

/** Rótulo legível da variante usado nos snapshots do pedido, ex.: "A2 / Preto". */
export function variantLabel(variant: { size: string | null; color: string | null }): string {
  return [variant.size, variant.color].filter(Boolean).join(' / ') || 'Único';
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
