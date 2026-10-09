// Endpoints administrativos (Bearer + X-Tenant-Id, enviados pelo client).
import { api } from './client';
import type { OrderStatus, Page, PaymentMethod } from './types';

export interface AdminVariant {
  id: string;
  productId: string;
  sku: string;
  size: string | null;
  color: string | null;
  colorHex: string | null;
  price: number | null;
  salePrice: number | null;
  stock: number;
  isActive: boolean;
  position: number;
}

export interface AdminImage {
  id: string;
  productId: string;
  variantId: string | null;
  url: string;
  alt: string;
  position: number;
  isPrimary: boolean;
  mimeType: string;
  sizeBytes: number;
}

export interface AdminProduct {
  id: string;
  categoryId: string | null;
  category: { id: string; name: string; slug: string } | null;
  name: string;
  slug: string;
  description: string;
  line: string | null;
  tags: string[];
  price: number;
  salePrice: number | null;
  sizeGuide: string | null;
  shippingInfo: string | null;
  isActive: boolean;
  isFeatured: boolean;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
  variants: AdminVariant[];
  images: AdminImage[];
}

export interface ProductInput {
  name: string;
  slug?: string;
  description: string;
  categoryId: string | null;
  line: string | null;
  tags: string[];
  price: number;
  salePrice: number | null;
  sizeGuide: string | null;
  shippingInfo: string | null;
  isActive: boolean;
  isFeatured: boolean;
  releasedAt: string | null;
}

export interface VariantInput {
  sku: string;
  size: string | null;
  color: string | null;
  colorHex: string | null;
  price: number | null;
  salePrice: number | null;
  isActive: boolean;
  position: number;
}

export interface AdminCategory {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  isActive: boolean;
}

export interface StockMovement {
  id: string;
  variantId: string;
  sku: string;
  type: 'INBOUND' | 'OUTBOUND' | 'ADJUSTMENT' | 'SALE' | 'RELEASE' | 'RETURN';
  quantity: number;
  balanceAfter: number;
  reason: string;
  orderId: string | null;
  userId: string | null;
  source: string;
  createdAt: string;
}

export interface AdminCatalog {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: 'GENERAL' | 'COLLECTION' | 'CAMPAIGN';
  isPublic: boolean;
  isActive: boolean;
  heroImageUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  productIds: string[];
  createdAt: string;
}

export interface CatalogLink {
  id: string;
  catalogId: string;
  catalog: { id: string; name: string; slug: string; isActive: boolean };
  token: string;
  /** Endereço público para enviar ao cliente (montado pela API com a URL oficial da loja). */
  url: string;
  label: string;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface AdminOrder {
  id: string;
  number: string;
  customerId: string;
  status: OrderStatus;
  source: 'STOREFRONT' | 'CATALOG' | 'CATALOG_LINK' | 'ADMIN';
  paymentMethod: PaymentMethod;
  currency: string;
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  total: number;
  address: { zipCode: string; street: string; number: string; complement: string | null; district: string; city: string; state: string };
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  notes: string | null;
  paymentExpiresAt: string | null;
  shippingCarrier: string | null;
  trackingCode: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: { id: string; productName: string; sku: string; variantLabel: string; unitPrice: number; quantity: number; lineTotal: number; variantId: string | null }[];
}

export interface OrderHistory {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  userId: string | null;
  source: string;
  createdAt: string;
}

export interface AdminPayment {
  id: string;
  provider: string;
  method: PaymentMethod;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';
  amount: number;
  externalId: string | null;
  rawStatus: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
}

export interface FinanceCategory {
  id: string;
  name: string;
  kind: 'INCOME' | 'EXPENSE';
  isSystem: boolean;
}

export interface Transaction {
  id: string;
  kind: 'INCOME' | 'EXPENSE';
  categoryId: string | null;
  categoryName: string | null;
  description: string;
  amount: number;
  competenceDate: string;
  paidAt: string | null;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  paymentMethod: string | null;
  orderId: string | null;
  paymentId: string | null;
  createdAt: string;
}

export interface FinanceSummary {
  period: { from: string; to: string };
  ordersCreated: { count: number; total: number };
  salesApproved: { count: number; total: number };
  received: number;
  incomeByCompetence: number;
  expensesPaid: number;
  expensesByCompetence: number;
  cashResult: number;
}

export interface Settings {
  currency: string;
  orderNumberPrefix: string;
  shippingMode: 'FLAT_RATE' | 'FREE';
  shippingFlatRate: number;
  freeShippingThreshold: number | null;
  pendingPaymentTtlMinutes: number;
  lowStockThreshold: number;
  contactEmail: string | null;
  contactPhone: string | null;
  termsUrl: string | null;
}

export interface Member {
  userId: string;
  email: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'OPERATOR';
  createdAt: string;
}

type Query = Record<string, string | number | boolean | undefined | null>;
const get = <T>(path: string, query?: Query) => api<T>(path, { admin: true, query });
const send = <T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown) => api<T>(path, { admin: true, method, body });

export const adminApi = {
  products: (q: Query) => get<Page<AdminProduct>>('/products', q),
  product: (id: string) => get<AdminProduct>(`/products/${id}`),
  createProduct: (body: ProductInput & { variants: (VariantInput & { stock: number })[] }) => send<AdminProduct>('POST', '/products', body),
  updateProduct: (id: string, body: Partial<ProductInput>) => send<AdminProduct>('PATCH', `/products/${id}`, body),
  deleteProduct: (id: string) => send<void>('DELETE', `/products/${id}`),
  addVariant: (id: string, body: VariantInput & { stock: number }) => send<AdminVariant>('POST', `/products/${id}/variants`, body),
  updateVariant: (id: string, variantId: string, body: Partial<VariantInput>) => send<AdminVariant>('PATCH', `/products/${id}/variants/${variantId}`, body),
  uploadImage: (id: string, file: File, alt: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('alt', alt);
    return api<AdminImage>(`/products/${id}/images`, { admin: true, method: 'POST', body: form });
  },
  updateImage: (id: string, imageId: string, body: { alt?: string; position?: number; isPrimary?: true }) => send<AdminImage>('PATCH', `/products/${id}/images/${imageId}`, body),
  deleteImage: (id: string, imageId: string) => send<void>('DELETE', `/products/${id}/images/${imageId}`),

  categories: () => get<{ items: AdminCategory[] }>('/categories'),
  createCategory: (body: Omit<AdminCategory, 'id'>) => send<AdminCategory>('POST', '/categories', body),
  updateCategory: (id: string, body: Partial<Omit<AdminCategory, 'id'>>) => send<AdminCategory>('PATCH', `/categories/${id}`, body),

  movements: (q: Query) => get<Page<StockMovement>>('/inventory/movements', q),
  lowStock: () => get<{ items: (AdminVariant & { productName: string })[] }>('/inventory/low-stock'),
  move: (variantId: string, body: { type: 'INBOUND' | 'OUTBOUND'; quantity: number; reason: string } | { type: 'ADJUSTMENT'; countedStock: number; reason: string }) =>
    send<{ balance: number; delta: number }>('POST', `/inventory/variants/${variantId}/movements`, body),

  catalogs: () => get<{ items: AdminCatalog[] }>('/catalogs'),
  createCatalog: (body: Omit<AdminCatalog, 'id' | 'createdAt'>) => send<AdminCatalog>('POST', '/catalogs', body),
  updateCatalog: (id: string, body: Partial<Omit<AdminCatalog, 'id' | 'createdAt' | 'productIds'>>) => send<AdminCatalog>('PATCH', `/catalogs/${id}`, body),
  setCatalogProducts: (id: string, productIds: string[]) => send<AdminCatalog>('PUT', `/catalogs/${id}/products`, { productIds }),

  links: () => get<{ items: CatalogLink[] }>('/catalog-links'),
  createLink: (body: { catalogId: string; label: string; expiresAt: string | null; maxUses: number | null }) => send<CatalogLink>('POST', '/catalog-links', body),
  updateLink: (id: string, body: { label?: string; expiresAt?: string | null; maxUses?: number | null; isActive?: boolean }) => send<CatalogLink>('PATCH', `/catalog-links/${id}`, body),

  orders: (q: Query) => get<Page<AdminOrder>>('/orders', q),
  order: (id: string) => get<{ order: AdminOrder; history: OrderHistory[]; payments: AdminPayment[] }>(`/orders/${id}`),
  changeStatus: (id: string, body: { status: OrderStatus; note?: string | null; shippingCarrier?: string | null; trackingCode?: string | null; restock?: boolean }) =>
    send<{ order: AdminOrder }>('PATCH', `/orders/${id}/status`, body),
  updateShipping: (id: string, body: { shippingCarrier: string | null; trackingCode: string | null }) => send<{ order: AdminOrder }>('PATCH', `/orders/${id}/shipping`, body),

  customers: (q: Query) => get<Page<Customer>>('/customers', q),
  customer: (id: string) => get<{ customer: Customer; orders: AdminOrder[] }>(`/customers/${id}`),

  financeSummary: (q: Query) => get<FinanceSummary>('/finance/summary', q),
  transactions: (q: Query) => get<Page<Transaction>>('/finance/transactions', q),
  financeCategories: () => get<{ items: FinanceCategory[] }>('/finance/categories'),
  createFinanceCategory: (body: { name: string; kind: 'INCOME' | 'EXPENSE' }) => send<FinanceCategory>('POST', '/finance/categories', body),
  createEntry: (kind: 'INCOME' | 'EXPENSE', body: { categoryId: string | null; description: string; amount: number; competenceDate: string; paidAt: string | null; paymentMethod: string | null }) =>
    send<Transaction>('POST', kind === 'INCOME' ? '/finance/incomes' : '/finance/expenses', body),
  updateTransaction: (id: string, body: { status: Transaction['status']; paidAt?: string | null }) => send<Transaction>('PATCH', `/finance/transactions/${id}`, body),
  cashflow: (q: Query) => get<{ items: { period: string; income: number; expense: number }[] }>('/finance/reports/cashflow', q),

  settings: () => get<Settings>('/settings'),
  updateSettings: (body: Partial<Settings>) => send<Settings>('PATCH', '/settings', body),
  members: () => get<{ items: Member[] }>('/tenants/current/members'),
};
