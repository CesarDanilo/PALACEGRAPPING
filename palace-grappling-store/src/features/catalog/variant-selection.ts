import type { PublicProduct, PublicVariant } from '@/lib/api/types';

// Regras de seleção de variante na página de produto. Puras, para teste.

export interface VariantAxes {
  sizes: string[];
  colors: { name: string; hex: string | null }[];
  requiresSize: boolean;
  requiresColor: boolean;
}

export function variantAxes(product: Pick<PublicProduct, 'variants'>): VariantAxes {
  const sizes = [...new Set(product.variants.map((v) => v.size).filter((s): s is string => Boolean(s)))];
  const colorMap = new Map<string, string | null>();
  for (const v of product.variants) if (v.color && !colorMap.has(v.color)) colorMap.set(v.color, v.colorHex);
  const colors = [...colorMap].map(([name, hex]) => ({ name, hex }));
  // Um eixo só é obrigatório quando há escolha real (mais de uma opção ou variantes com/sem o atributo).
  return { sizes, colors, requiresSize: sizes.length > 0, requiresColor: colors.length > 1 };
}

export interface Selection {
  size: string | null;
  color: string | null;
}

/** Variante correspondente à seleção, ou null se a seleção ainda está incompleta. */
export function resolveVariant(product: Pick<PublicProduct, 'variants'>, selection: Selection): PublicVariant | null {
  const axes = variantAxes(product);
  if (axes.requiresSize && !selection.size) return null;
  if (axes.requiresColor && !selection.color) return null;
  const color = selection.color ?? (axes.colors.length === 1 ? axes.colors[0]!.name : null);
  return (
    product.variants.find((v) => (axes.requiresSize ? v.size === selection.size : true) && (color ? v.color === color : true)) ?? null
  );
}

export type AddToCartBlock = 'SELECT_SIZE' | 'SELECT_COLOR' | 'UNAVAILABLE' | null;

/** Motivo que impede adicionar ao carrinho (o botão fica bloqueado com a mensagem correspondente). */
export function addToCartBlock(product: Pick<PublicProduct, 'variants'>, selection: Selection): AddToCartBlock {
  const axes = variantAxes(product);
  if (axes.requiresSize && !selection.size) return 'SELECT_SIZE';
  if (axes.requiresColor && !selection.color) return 'SELECT_COLOR';
  const variant = resolveVariant(product, selection);
  if (!variant || variant.availability === 'out') return 'UNAVAILABLE';
  return null;
}

/** Tamanhos esgotados para a cor escolhida (para desabilitar opções). */
export function unavailableSizes(product: Pick<PublicProduct, 'variants'>, color: string | null): Set<string> {
  const result = new Set<string>();
  const axes = variantAxes(product);
  for (const size of axes.sizes) {
    const options = product.variants.filter((v) => v.size === size && (!color || v.color === color));
    if (!options.some((v) => v.availability !== 'out')) result.add(size);
  }
  return result;
}
