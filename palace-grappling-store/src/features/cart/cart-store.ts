import { useSyncExternalStore } from 'react';
import type { SalesContext } from '@/lib/api/types';

// Carrinho local. Guarda apenas variante + quantidade + dados de exibição.
// Preço e disponibilidade exibidos no carrinho vêm sempre de /checkout/quote;
// os valores guardados aqui servem só como prévia e nunca são enviados como preço.

export interface CartItem {
  variantId: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  imageUrl: string | null;
  /** Prévia de preço no momento da adição (não confiável). */
  previewUnitPrice: number;
  quantity: number;
}

export interface CartState {
  items: CartItem[];
  /** Catálogo/link de origem: limita os produtos válidos e registra a origem do pedido. */
  context: SalesContext;
}

const KEY = 'pg.cart.v1';
export const MAX_QUANTITY = 20;
const empty: CartState = { items: [], context: { kind: 'storefront' } };

function load(): CartState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as CartState;
    if (!Array.isArray(parsed.items)) return empty;
    return { items: parsed.items, context: parsed.context ?? empty.context };
  } catch {
    return empty;
  }
}

let state: CartState = typeof window === 'undefined' ? empty : load();
const listeners = new Set<() => void>();

function commit(next: CartState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* modo privado: o carrinho vive só nesta aba */
  }
  listeners.forEach((l) => l());
}

const clamp = (q: number) => Math.max(1, Math.min(MAX_QUANTITY, Math.floor(q)));

export const cart = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  add(item: Omit<CartItem, 'quantity'>, quantity = 1, context?: SalesContext) {
    const ctx = context ?? state.context;
    // Trocar de contexto (ex.: entrar por um link exclusivo) começa um carrinho novo para não misturar origens.
    const base = JSON.stringify(ctx) === JSON.stringify(state.context) ? state.items : [];
    const existing = base.find((i) => i.variantId === item.variantId);
    const items = existing
      ? base.map((i) => (i.variantId === item.variantId ? { ...i, quantity: clamp(i.quantity + quantity) } : i))
      : [...base, { ...item, quantity: clamp(quantity) }];
    commit({ items, context: ctx });
  },
  setQuantity(variantId: string, quantity: number) {
    commit({ ...state, items: state.items.map((i) => (i.variantId === variantId ? { ...i, quantity: clamp(quantity) } : i)) });
  },
  remove(variantId: string) {
    commit({ ...state, items: state.items.filter((i) => i.variantId !== variantId) });
  },
  clear() {
    commit(empty);
  },
};

export function useCart(): CartState {
  return useSyncExternalStore(cart.subscribe, cart.get, cart.get);
}

export function useCartCount(): number {
  const { items } = useCart();
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

/** Para testes. */
export function __resetCart() {
  state = load();
}
