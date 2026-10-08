// Registros que atravessam a fronteira application ⇄ infrastructure.
// Valores monetários sempre em centavos (Cents); datas como Date.
import type { Role } from '../../domain/access/permissions.js';
import type { OrderStatus } from '../../domain/orders/order-status.js';
import type { PaymentMethod, PaymentStatus } from '../../domain/payments/payment-status.js';
import type { Cents } from '../../shared/money.js';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isActive: boolean;
  isPlatformAdmin: boolean;
}

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface MembershipRecord {
  tenant: TenantRecord;
  role: Role;
}

export interface MemberRecord {
  userId: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  rotatedAt: Date | null;
}

export interface TenantSettingsRecord {
  tenantId: string;
  currency: string;
  orderNumberPrefix: string;
  shippingMode: 'FLAT_RATE' | 'FREE';
  shippingFlatRate: Cents;
  freeShippingThreshold: Cents | null;
  pendingPaymentTtlMinutes: number;
  lowStockThreshold: number;
  contactEmail: string | null;
  contactPhone: string | null;
  termsUrl: string | null;
}

export interface CategoryRecord {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  isActive: boolean;
}

export interface VariantRecord {
  id: string;
  productId: string;
  sku: string;
  size: string | null;
  color: string | null;
  colorHex: string | null;
  price: Cents | null;
  salePrice: Cents | null;
  stock: number;
  isActive: boolean;
  position: number;
}

export interface ImageRecord {
  id: string;
  productId: string;
  variantId: string | null;
  storagePath: string;
  url: string;
  alt: string;
  position: number;
  isPrimary: boolean;
  mimeType: string;
  sizeBytes: number;
}

export interface ProductRecord {
  id: string;
  tenantId: string;
  categoryId: string | null;
  category: { id: string; name: string; slug: string } | null;
  name: string;
  slug: string;
  description: string;
  line: string | null;
  tags: string[];
  price: Cents;
  salePrice: Cents | null;
  sizeGuide: string | null;
  shippingInfo: string | null;
  isActive: boolean;
  isFeatured: boolean;
  releasedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  variants: VariantRecord[];
  images: ImageRecord[];
}

export interface StockMovementRecord {
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
  createdAt: Date;
}

export interface CatalogRecord {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string;
  type: 'GENERAL' | 'COLLECTION' | 'CAMPAIGN';
  isPublic: boolean;
  isActive: boolean;
  heroImageUrl: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  productIds: string[];
  createdAt: Date;
}

export interface CatalogLinkRecord {
  id: string;
  tenantId: string;
  catalogId: string;
  token: string;
  label: string;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
  isActive: boolean;
  createdAt: Date;
  catalog: CatalogRecord;
}

export interface CustomerRecord {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: Date;
  orderCount: number;
  totalSpent: Cents;
}

export interface ShippingAddress {
  zipCode: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
}

export type OrderSource = 'STOREFRONT' | 'CATALOG' | 'CATALOG_LINK' | 'ADMIN';

export interface OrderItemRecord {
  id: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  sku: string;
  variantLabel: string;
  size: string | null;
  color: string | null;
  unitPrice: Cents;
  quantity: number;
  lineTotal: Cents;
}

export interface PaymentRecord {
  id: string;
  tenantId: string;
  orderId: string;
  provider: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: Cents;
  externalReference: string;
  checkoutId: string | null;
  externalId: string | null;
  checkoutUrl: string | null;
  rawStatus: string | null;
  approvedAt: Date | null;
  createdAt: Date;
}

export interface OrderRecord {
  id: string;
  tenantId: string;
  number: string;
  customerId: string;
  status: OrderStatus;
  source: OrderSource;
  catalogId: string | null;
  catalogLinkId: string | null;
  paymentMethod: PaymentMethod;
  currency: string;
  subtotal: Cents;
  shippingTotal: Cents;
  discountTotal: Cents;
  total: Cents;
  address: ShippingAddress;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  notes: string | null;
  idempotencyKey: string;
  trackingTokenHash: string;
  paymentExpiresAt: Date | null;
  shippingCarrier: string | null;
  trackingCode: string | null;
  paidAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  items: OrderItemRecord[];
}

export interface OrderHistoryRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  userId: string | null;
  source: string;
  createdAt: Date;
}

export interface FinanceCategoryRecord {
  id: string;
  name: string;
  kind: 'INCOME' | 'EXPENSE';
  isSystem: boolean;
}

export interface FinancialTransactionRecord {
  id: string;
  tenantId: string;
  kind: 'INCOME' | 'EXPENSE';
  categoryId: string | null;
  categoryName: string | null;
  description: string;
  amount: Cents;
  competenceDate: Date;
  paidAt: Date | null;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  paymentMethod: string | null;
  orderId: string | null;
  paymentId: string | null;
  createdAt: Date;
}
