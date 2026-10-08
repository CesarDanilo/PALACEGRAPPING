import { useQuery } from '@tanstack/react-query';
import { storefrontApi } from '@/lib/api/storefront';
import type { CartState } from './cart-store';

/** Cotação do carrinho no servidor: fonte única de preço, frete e disponibilidade exibidos. */
export function useQuote(cart: CartState, zipCode: string | null = null) {
  const items = cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
  return useQuery({
    queryKey: ['quote', items, cart.context, zipCode],
    queryFn: () => storefrontApi.quote(items, cart.context, zipCode),
    enabled: items.length > 0,
    staleTime: 0,
    retry: 1,
  });
}

export const problemLabel = {
  NOT_FOUND: 'Produto indisponível',
  UNAVAILABLE: 'Produto fora de linha',
  NOT_IN_CATALOG: 'Fora desta seleção exclusiva',
  INSUFFICIENT_STOCK: 'Estoque insuficiente',
} as const;
