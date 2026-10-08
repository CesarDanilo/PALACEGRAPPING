import { api } from './client';
import type { Page, PlacedOrderResponse, PaymentStart, PublicCatalog, PublicCategory, PublicOrder, PublicProduct, Quote, SalesContext, StoreInfo } from './types';

export interface Facets {
  lines: string[];
  sizes: string[];
  colors: { name: string; hex: string | null }[];
}

export interface ProductQuery {
  page?: number;
  pageSize?: number;
  category?: string;
  line?: string;
  size?: string;
  color?: string;
  inStock?: boolean;
  featured?: boolean;
  search?: string;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest';
}

export interface CartLineInput {
  variantId: string;
  quantity: number;
}

export interface CheckoutPayload {
  items: CartLineInput[];
  context: SalesContext;
  customer: { name: string; phone: string; email: string | null };
  address: { zipCode: string; street: string; number: string; complement: string | null; district: string; city: string; state: string };
  paymentMethod: 'PIX' | 'CARD';
  notes: string | null;
  acceptTerms: true;
  expectedTotal: number | null;
}

export const storefrontApi = {
  store: () => api<StoreInfo>('/public/store', { store: true }),
  categories: () => api<{ items: PublicCategory[] }>('/public/categories', { store: true }),
  products: (query: ProductQuery) => api<Page<PublicProduct>>('/public/products', { store: true, query: { ...query } }),
  product: (slug: string) => api<{ product: PublicProduct; related: PublicProduct[] }>(`/public/products/${encodeURIComponent(slug)}`, { store: true }),
  catalogs: () => api<{ items: PublicCatalog[] }>('/public/catalogs', { store: true }),
  facets: (catalog?: string) => api<Facets>('/public/facets', { store: true, query: { catalog } }),
  catalog: (slug: string, query: ProductQuery = {}) =>
    api<{ catalog: PublicCatalog; products: Page<PublicProduct> }>(`/public/catalogs/${encodeURIComponent(slug)}`, { store: true, query: { ...query } }),
  link: (token: string, query: ProductQuery = {}) =>
    api<{ store: { slug: string; name: string }; link: { label: string; expiresAt: string | null }; catalog: PublicCatalog; products: Page<PublicProduct> }>(
      `/public/catalog-links/${encodeURIComponent(token)}`,
      { query: { ...query } },
    ),
  quote: (items: CartLineInput[], context: SalesContext, zipCode: string | null) =>
    api<Quote>('/checkout/quote', { method: 'POST', store: true, body: { items, context, zipCode } }),
  placeOrder: (payload: CheckoutPayload, idempotencyKey: string) =>
    api<PlacedOrderResponse>('/checkout/orders', { method: 'POST', store: true, body: payload, headers: { 'Idempotency-Key': idempotencyKey } }),
  order: (number: string, token: string) =>
    api<PublicOrder>(`/public/orders/${encodeURIComponent(number)}`, { store: true, headers: { 'X-Order-Token': token } }),
  startPayment: (orderNumber: string, token: string, method?: 'PIX' | 'CARD') =>
    api<PaymentStart>('/payments', { method: 'POST', store: true, body: { orderNumber, method }, headers: { 'X-Order-Token': token } }),
};

export const storefrontKeys = {
  store: ['store'] as const,
  categories: ['categories'] as const,
  catalogs: ['catalogs'] as const,
  facets: (catalog?: string) => ['facets', catalog ?? null] as const,
  products: (q: ProductQuery) => ['products', q] as const,
  product: (slug: string) => ['product', slug] as const,
  catalog: (slug: string, q: ProductQuery) => ['catalog', slug, q] as const,
  link: (token: string, q: ProductQuery) => ['link', token, q] as const,
  order: (number: string) => ['order', number] as const,
};
