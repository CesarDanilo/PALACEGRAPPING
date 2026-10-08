// Contrato da commerce-api consumido pela loja. Mantido aqui (e não importado do
// backend) para que os projetos continuem independentes; a fonte de verdade é o
// documento OpenAPI publicado pela API em /openapi.json.
// Valores monetários: inteiros em centavos.

export type Availability = 'out' | 'low' | 'ok';

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface StoreInfo {
  slug: string;
  name: string;
  currency: string;
  shipping: { mode: 'FLAT_RATE' | 'FREE'; flatRate: number; freeShippingThreshold: number | null };
  contactEmail: string | null;
  contactPhone: string | null;
  termsUrl: string | null;
}

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  position: number;
}

export interface PublicVariant {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  colorHex: string | null;
  price: number;
  compareAtPrice: number | null;
  availability: Availability;
}

export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  line: string | null;
  tags: string[];
  category: { id: string; name: string; slug: string } | null;
  price: number;
  salePrice: number | null;
  priceRange: { min: number; max: number };
  sizeGuide: string | null;
  shippingInfo: string | null;
  isFeatured: boolean;
  releasedAt: string | null;
  availability: Availability;
  images: { id: string; url: string; alt: string; isPrimary: boolean; variantId: string | null }[];
  variants: PublicVariant[];
}

export interface PublicCatalog {
  name: string;
  slug: string;
  description: string;
  type: 'GENERAL' | 'COLLECTION' | 'CAMPAIGN';
  heroImageUrl: string | null;
  endsAt: string | null;
  productCount: number;
}

export type SalesContext = { kind: 'storefront' } | { kind: 'catalog'; slug: string } | { kind: 'link'; token: string };

export type LineProblem = 'NOT_FOUND' | 'UNAVAILABLE' | 'NOT_IN_CATALOG' | 'INSUFFICIENT_STOCK';

export interface QuoteLine {
  variantId: string;
  productId: string | null;
  productName: string;
  productSlug: string | null;
  imageUrl: string | null;
  sku: string | null;
  variantLabel: string;
  size: string | null;
  color: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  availableStock: number;
  problem: LineProblem | null;
}

export interface Quote {
  currency: string;
  lines: QuoteLine[];
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  valid: boolean;
}

export type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'PREPARING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'EXPIRED' | 'RETURNED';
export type PaymentMethod = 'PIX' | 'CARD';

export interface PublicOrder {
  number: string;
  status: OrderStatus;
  createdAt: string;
  paymentMethod: PaymentMethod;
  paymentExpiresAt: string | null;
  currency: string;
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  total: number;
  customerName: string;
  shippingAddress: { city: string; state: string; district: string };
  shipping: { carrier: string | null; trackingCode: string | null; shippedAt: string | null; deliveredAt: string | null };
  items: { productName: string; variantLabel: string; quantity: number; unitPrice: number; lineTotal: number }[];
  payment: { method: PaymentMethod; status: string; checkoutUrl: string | null } | null;
}

export type PaymentStart =
  | { status: 'READY'; method: PaymentMethod; checkoutUrl: string | null }
  | { status: 'NOT_CONFIGURED'; message: string }
  | { status: 'FAILED'; message: string };

export interface PlacedOrderResponse {
  order: PublicOrder;
  trackingToken: string;
  replayed: boolean;
  payment: PaymentStart | null;
}

// ── Administração ──

export type Role = 'OWNER' | 'ADMIN' | 'OPERATOR';

export interface Membership {
  tenant: { id: string; slug: string; name: string };
  role: Role;
  permissions: string[];
}

export interface Profile {
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean };
  memberships: Membership[];
}

export interface LoginResponse extends Profile {
  accessToken: string;
  expiresIn: number;
}

export interface Dashboard {
  period: { from: string; to: string };
  pendingOrders: number;
  toFulfil: number;
  awaitingPayments: number;
  lowStock: { id: string; sku: string; productName: string; stock: number; size: string | null; color: string | null }[];
  activity: { id: string; orderNumber: string; fromStatus: OrderStatus | null; toStatus: OrderStatus; source: string; createdAt: string }[];
  finance: null | {
    ordersCreated: { count: number; total: number };
    salesApproved: { count: number; total: number };
    received: number;
    expensesPaid: number;
    expensesByCompetence: number;
    cashResult: number;
  };
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}
