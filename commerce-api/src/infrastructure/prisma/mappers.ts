// Conversões entre modelos Prisma e registros da aplicação.
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  CatalogRecord,
  CategoryRecord,
  FinancialTransactionRecord,
  ImageRecord,
  OrderRecord,
  PaymentRecord,
  ProductRecord,
  TenantSettingsRecord,
  VariantRecord,
} from '../../application/ports/records.js';
import { type Cents, parseDecimal, toDecimalString } from '../../shared/money.js';

type Decimalish = Prisma.Decimal | { toFixed(digits: number): string };

export const toCents = (value: Decimalish): Cents => parseDecimal(value.toFixed(2));
export const toCentsOrNull = (value: Decimalish | null | undefined): Cents | null => (value == null ? null : toCents(value));
export const dec = (value: Cents): string => toDecimalString(value);
export const decOrNull = (value: Cents | null | undefined): string | null => (value == null ? null : toDecimalString(value));

export const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
  variants: { orderBy: [{ position: 'asc' }, { sku: 'asc' }] },
  images: { orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }] },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
type VariantRow = Prisma.ProductVariantGetPayload<object>;
type ImageRow = Prisma.ProductImageGetPayload<object>;

export function mapVariant(v: VariantRow): VariantRecord {
  return {
    id: v.id,
    productId: v.productId,
    sku: v.sku,
    size: v.size,
    color: v.color,
    colorHex: v.colorHex,
    price: toCentsOrNull(v.price),
    salePrice: toCentsOrNull(v.salePrice),
    stock: v.stock,
    isActive: v.isActive,
    position: v.position,
  };
}

export function mapImage(i: ImageRow): ImageRecord {
  return {
    id: i.id,
    productId: i.productId,
    variantId: i.variantId,
    storagePath: i.storagePath,
    url: i.url,
    alt: i.alt,
    position: i.position,
    isPrimary: i.isPrimary,
    mimeType: i.mimeType,
    sizeBytes: i.sizeBytes,
  };
}

export function mapProduct(p: ProductRow): ProductRecord {
  return {
    id: p.id,
    tenantId: p.tenantId,
    categoryId: p.categoryId,
    category: p.category,
    name: p.name,
    slug: p.slug,
    description: p.description,
    line: p.line,
    tags: p.tags,
    price: toCents(p.price),
    salePrice: toCentsOrNull(p.salePrice),
    sizeGuide: p.sizeGuide,
    shippingInfo: p.shippingInfo,
    isActive: p.isActive,
    isFeatured: p.isFeatured,
    releasedAt: p.releasedAt,
    deletedAt: p.deletedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    variants: p.variants.map(mapVariant),
    images: p.images.map(mapImage),
  };
}

export function mapCategory(c: Prisma.CategoryGetPayload<object>): CategoryRecord {
  return {
    id: c.id,
    tenantId: c.tenantId,
    parentId: c.parentId,
    name: c.name,
    slug: c.slug,
    description: c.description,
    position: c.position,
    isActive: c.isActive,
  };
}

export function mapSettings(s: Prisma.TenantSettingsGetPayload<object>): TenantSettingsRecord {
  return {
    tenantId: s.tenantId,
    currency: s.currency,
    orderNumberPrefix: s.orderNumberPrefix,
    shippingMode: s.shippingMode,
    shippingFlatRate: toCents(s.shippingFlatRate),
    freeShippingThreshold: toCentsOrNull(s.freeShippingThreshold),
    pendingPaymentTtlMinutes: s.pendingPaymentTtlMinutes,
    lowStockThreshold: s.lowStockThreshold,
    contactEmail: s.contactEmail,
    contactPhone: s.contactPhone,
    termsUrl: s.termsUrl,
  };
}

export const catalogInclude = {
  products: { orderBy: { position: 'asc' }, select: { productId: true } },
} satisfies Prisma.CatalogInclude;

export function mapCatalog(c: Prisma.CatalogGetPayload<{ include: typeof catalogInclude }>): CatalogRecord {
  return {
    id: c.id,
    tenantId: c.tenantId,
    name: c.name,
    slug: c.slug,
    description: c.description,
    type: c.type,
    isPublic: c.isPublic,
    isActive: c.isActive,
    heroImageUrl: c.heroImageUrl,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    productIds: c.products.map((p) => p.productId),
    createdAt: c.createdAt,
  };
}

export const orderInclude = { items: { orderBy: { productName: 'asc' } } } satisfies Prisma.OrderInclude;

export function mapOrder(o: Prisma.OrderGetPayload<{ include: typeof orderInclude }>): OrderRecord {
  return {
    id: o.id,
    tenantId: o.tenantId,
    number: o.number,
    customerId: o.customerId,
    status: o.status,
    source: o.source,
    catalogId: o.catalogId,
    catalogLinkId: o.catalogLinkId,
    paymentMethod: o.paymentMethod,
    currency: o.currency,
    subtotal: toCents(o.subtotal),
    shippingTotal: toCents(o.shippingTotal),
    discountTotal: toCents(o.discountTotal),
    total: toCents(o.total),
    address: {
      zipCode: o.shipZipCode,
      street: o.shipStreet,
      number: o.shipNumber,
      complement: o.shipComplement,
      district: o.shipDistrict,
      city: o.shipCity,
      state: o.shipState,
    },
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerEmail: o.customerEmail,
    notes: o.notes,
    idempotencyKey: o.idempotencyKey,
    trackingTokenHash: o.trackingTokenHash,
    paymentExpiresAt: o.paymentExpiresAt,
    shippingCarrier: o.shippingCarrier,
    trackingCode: o.trackingCode,
    paidAt: o.paidAt,
    shippedAt: o.shippedAt,
    deliveredAt: o.deliveredAt,
    cancelledAt: o.cancelledAt,
    createdAt: o.createdAt,
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      productName: i.productName,
      sku: i.sku,
      variantLabel: i.variantLabel,
      size: i.size,
      color: i.color,
      unitPrice: toCents(i.unitPrice),
      quantity: i.quantity,
      lineTotal: toCents(i.lineTotal),
    })),
  };
}

export function mapPayment(p: Prisma.PaymentGetPayload<object>): PaymentRecord {
  return {
    id: p.id,
    tenantId: p.tenantId,
    orderId: p.orderId,
    provider: p.provider,
    method: p.method,
    status: p.status,
    amount: toCents(p.amount),
    externalReference: p.externalReference,
    checkoutId: p.checkoutId,
    externalId: p.externalId,
    checkoutUrl: p.checkoutUrl,
    rawStatus: p.rawStatus,
    approvedAt: p.approvedAt,
    createdAt: p.createdAt,
  };
}

export const transactionInclude = { category: { select: { name: true } } } satisfies Prisma.FinancialTransactionInclude;

export function mapTransaction(t: Prisma.FinancialTransactionGetPayload<{ include: typeof transactionInclude }>): FinancialTransactionRecord {
  return {
    id: t.id,
    tenantId: t.tenantId,
    kind: t.kind,
    categoryId: t.categoryId,
    categoryName: t.category?.name ?? null,
    description: t.description,
    amount: toCents(t.amount),
    competenceDate: t.competenceDate,
    paidAt: t.paidAt,
    status: t.status,
    paymentMethod: t.paymentMethod,
    orderId: t.orderId,
    paymentId: t.paymentId,
    createdAt: t.createdAt,
  };
}
