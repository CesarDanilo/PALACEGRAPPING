// Formas de resposta. Rotas públicas usam serializadores próprios que expõem
// somente o necessário para a vitrine (sem estoque exato, caminhos de storage,
// ids de tenant ou dados de clientes).
import type { CatalogLinkRecord, CatalogRecord, OrderRecord, PaymentRecord, ProductRecord } from '../../application/ports/records.js';
import { effectiveUnitPrice } from '../../domain/pricing/pricing.js';

export type StockLevel = 'out' | 'low' | 'ok';

const LOW_STOCK_PUBLIC = 3;
const level = (stock: number): StockLevel => (stock <= 0 ? 'out' : stock <= LOW_STOCK_PUBLIC ? 'low' : 'ok');

export function publicProduct(p: ProductRecord) {
  const variants = p.variants.filter((v) => v.isActive);
  const prices = variants.length ? variants.map((v) => effectiveUnitPrice(p, v)) : [effectiveUnitPrice(p, {})];
  const totalStock = variants.reduce((sum, v) => sum + Math.max(0, v.stock), 0);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    line: p.line,
    tags: p.tags,
    category: p.category,
    price: p.price,
    salePrice: p.salePrice,
    priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
    sizeGuide: p.sizeGuide,
    shippingInfo: p.shippingInfo,
    isFeatured: p.isFeatured,
    releasedAt: p.releasedAt,
    availability: level(totalStock),
    images: p.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, isPrimary: i.isPrimary, variantId: i.variantId })),
    variants: variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      size: v.size,
      color: v.color,
      colorHex: v.colorHex,
      price: effectiveUnitPrice(p, v),
      compareAtPrice: (v.price ?? p.price) > effectiveUnitPrice(p, v) ? (v.price ?? p.price) : null,
      availability: level(v.stock),
    })),
  };
}

export function publicCatalog(c: CatalogRecord) {
  return {
    name: c.name,
    slug: c.slug,
    description: c.description,
    type: c.type,
    heroImageUrl: c.heroImageUrl,
    endsAt: c.endsAt,
    productCount: c.productIds.length,
  };
}

export function adminLink(l: CatalogLinkRecord) {
  return {
    id: l.id,
    catalogId: l.catalogId,
    catalog: { id: l.catalog.id, name: l.catalog.name, slug: l.catalog.slug },
    token: l.token,
    label: l.label,
    expiresAt: l.expiresAt,
    maxUses: l.maxUses,
    useCount: l.useCount,
    isActive: l.isActive,
    createdAt: l.createdAt,
  };
}

export function publicPayment(p: PaymentRecord | undefined) {
  if (!p) return null;
  return { method: p.method, status: p.status, checkoutUrl: p.status === 'PENDING' ? p.checkoutUrl : null };
}

/** Visão do pedido para o comprador que possui o token de acompanhamento. */
export function publicOrder(o: OrderRecord, latestPayment?: PaymentRecord) {
  return {
    number: o.number,
    status: o.status,
    createdAt: o.createdAt,
    paymentMethod: o.paymentMethod,
    paymentExpiresAt: o.status === 'PENDING_PAYMENT' ? o.paymentExpiresAt : null,
    currency: o.currency,
    subtotal: o.subtotal,
    shippingTotal: o.shippingTotal,
    discountTotal: o.discountTotal,
    total: o.total,
    customerName: o.customerName,
    shippingAddress: { city: o.address.city, state: o.address.state, district: o.address.district },
    shipping: { carrier: o.shippingCarrier, trackingCode: o.trackingCode, shippedAt: o.shippedAt, deliveredAt: o.deliveredAt },
    items: o.items.map((i) => ({
      productName: i.productName,
      variantLabel: i.variantLabel,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
    })),
    payment: publicPayment(latestPayment),
  };
}

export function adminOrderSummary(o: OrderRecord) {
  const { trackingTokenHash: _hash, idempotencyKey: _key, ...rest } = o;
  return rest;
}
