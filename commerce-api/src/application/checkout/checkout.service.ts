import { effectiveUnitPrice } from '../../domain/pricing/pricing.js';
import { variantLabel } from '../../domain/products/product-rules.js';
import type { PaymentMethod } from '../../domain/payments/payment-status.js';
import { AppError, notFound, UniqueViolationError, validation } from '../../shared/errors.js';
import { hmacSha256Hex, orderNumber, safeEqual, sha256 } from '../../shared/crypto.js';
import { type Cents, multiply, sum, ZERO } from '../../shared/money.js';
import type { CatalogService } from '../catalogs/catalog.service.js';
import type { Repositories, UnitOfWork } from '../ports/repositories.js';
import type { OrderRecord, OrderSource, ShippingAddress } from '../ports/records.js';
import type { Clock, ShippingCalculator } from '../ports/services.js';

export interface CartItemInput {
  variantId: string;
  quantity: number;
}

/** Contexto de vitrine: limita os produtos compráveis ao catálogo/link usado. */
export type SalesContext = { kind: 'storefront' } | { kind: 'catalog'; slug: string } | { kind: 'link'; token: string };

export interface QuoteInput {
  items: CartItemInput[];
  zipCode: string | null;
  context: SalesContext;
}

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
  unitPrice: Cents;
  quantity: number;
  lineTotal: Cents;
  availableStock: number;
  problem: LineProblem | null;
}

export interface Quote {
  currency: string;
  lines: QuoteLine[];
  subtotal: Cents;
  shipping: Cents;
  discount: Cents;
  total: Cents;
  valid: boolean;
}

export interface PlaceOrderInput extends QuoteInput {
  customer: { name: string; phone: string; email: string | null };
  address: ShippingAddress;
  paymentMethod: PaymentMethod;
  notes: string | null;
  acceptTerms: true;
  /** Total que o comprador viu. Se divergir do recalculado, o pedido não é criado. */
  expectedTotal: Cents | null;
}

export interface PlacedOrder {
  order: OrderRecord;
  /** Token de acompanhamento (mostrado uma vez; o banco guarda só o hash). */
  trackingToken: string;
  replayed: boolean;
}

interface ResolvedContext {
  source: OrderSource;
  catalogId: string | null;
  catalogLinkId: string | null;
  allowedProductIds: Set<string> | null;
}

export class CheckoutService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly catalogs: CatalogService,
    private readonly shipping: ShippingCalculator,
    private readonly clock: Clock,
    private readonly trackingSecret: string,
  ) {}

  /** Recalcula carrinho com preços e estoque do banco. Não reserva nada. */
  async quote(tenantId: string, input: QuoteInput): Promise<Quote> {
    const context = await this.resolveContext(tenantId, input.context);
    return this.price(this.uow.repos, tenantId, input, context);
  }

  async placeOrder(tenantId: string, input: PlaceOrderInput, idempotencyKey: string): Promise<PlacedOrder> {
    const trackingToken = hmacSha256Hex(this.trackingSecret, `order-tracking:${tenantId}:${idempotencyKey}`);

    const existing = await this.uow.repos.orders.findByIdempotencyKey(tenantId, idempotencyKey);
    if (existing) return { order: existing, trackingToken, replayed: true };

    const context = await this.resolveContext(tenantId, input.context);
    const settings = await this.uow.repos.tenants.getSettings(tenantId);
    const now = this.clock.now();

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const order = await this.uow.transaction(async (repos) => {
          const quote = await this.price(repos, tenantId, input, context);
          if (!quote.valid) {
            const stockOnly = quote.lines.every((l) => l.problem === null || l.problem === 'INSUFFICIENT_STOCK');
            throw new AppError(
              stockOnly ? 'INSUFFICIENT_STOCK' : 'VALIDATION_ERROR',
              stockOnly ? 'Estoque insuficiente para um ou mais itens' : 'Um ou mais itens não estão disponíveis',
              { lines: quote.lines.filter((l) => l.problem).map((l) => ({ variantId: l.variantId, problem: l.problem, availableStock: l.availableStock })) },
            );
          }
          if (input.expectedTotal != null && input.expectedTotal !== quote.total) {
            throw new AppError('PRICE_CHANGED', 'Os valores do carrinho mudaram; revise antes de finalizar', { quote });
          }

          // Baixa atômica em ordem fixa de variante (evita deadlock entre pedidos concorrentes).
          const balances = new Map<string, number>();
          for (const line of [...quote.lines].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
            const balance = await repos.variants.applyStockDelta(tenantId, line.variantId, -line.quantity);
            if (balance == null) {
              throw new AppError('INSUFFICIENT_STOCK', 'Estoque insuficiente para um ou mais itens', {
                lines: [{ variantId: line.variantId, problem: 'INSUFFICIENT_STOCK' }],
              });
            }
            balances.set(line.variantId, balance);
          }

          if (context.catalogLinkId && !(await repos.catalogLinks.consumeUse(tenantId, context.catalogLinkId))) {
            throw new AppError('LINK_UNAVAILABLE', 'Este link atingiu o limite de utilizações');
          }

          const customer = await repos.customers.upsertByPhone(tenantId, input.customer);
          await repos.customers.addAddress(tenantId, customer.id, input.address);

          const created = await repos.orders.create(tenantId, {
            number: orderNumber(settings.orderNumberPrefix),
            customerId: customer.id,
            source: context.source,
            catalogId: context.catalogId,
            catalogLinkId: context.catalogLinkId,
            paymentMethod: input.paymentMethod,
            currency: settings.currency,
            subtotal: quote.subtotal,
            shippingTotal: quote.shipping,
            discountTotal: quote.discount,
            total: quote.total,
            address: input.address,
            customerName: input.customer.name,
            customerPhone: input.customer.phone,
            customerEmail: input.customer.email,
            notes: input.notes,
            idempotencyKey,
            trackingTokenHash: sha256(trackingToken),
            termsAcceptedAt: now,
            paymentExpiresAt: new Date(now.getTime() + settings.pendingPaymentTtlMinutes * 60_000),
            items: quote.lines.map((l) => ({
              productId: l.productId,
              variantId: l.variantId,
              productName: l.productName,
              sku: l.sku ?? '',
              variantLabel: l.variantLabel,
              size: l.size,
              color: l.color,
              unitPrice: l.unitPrice,
              quantity: l.quantity,
              lineTotal: l.lineTotal,
            })),
          });

          for (const line of quote.lines) {
            await repos.stockMovements.create(tenantId, {
              variantId: line.variantId,
              type: 'SALE',
              quantity: -line.quantity,
              balanceAfter: balances.get(line.variantId) ?? 0,
              reason: `Pedido ${created.number}`,
              orderId: created.id,
              userId: null,
              source: 'checkout',
            });
          }
          await repos.orders.addHistory(tenantId, {
            orderId: created.id,
            fromStatus: null,
            toStatus: 'PENDING_PAYMENT',
            note: null,
            userId: null,
            source: 'checkout',
          });
          return created;
        });
        return { order, trackingToken, replayed: false };
      } catch (error) {
        if (error instanceof UniqueViolationError) {
          if (error.fields.includes('idempotencyKey')) {
            // Outra requisição com a mesma chave venceu a corrida: devolve o pedido dela.
            const winner = await this.uow.repos.orders.findByIdempotencyKey(tenantId, idempotencyKey);
            if (winner) return { order: winner, trackingToken, replayed: true };
          }
          if (error.fields.includes('number')) continue; // colisão de número público: tenta outro
        }
        throw error;
      }
    }
    throw new AppError('INTERNAL_ERROR', 'Não foi possível gerar o número do pedido');
  }

  /** Confere o token de acompanhamento de um pedido (acesso público seguro). */
  async findTrackedOrder(tenantId: string, number: string, token: string) {
    const order = await this.uow.repos.orders.findByNumber(tenantId, number);
    if (!order || !token || !safeEqual(order.trackingTokenHash, sha256(token))) throw notFound('Pedido');
    return order;
  }

  private async resolveContext(tenantId: string, context: SalesContext): Promise<ResolvedContext> {
    if (context.kind === 'storefront') return { source: 'STOREFRONT', catalogId: null, catalogLinkId: null, allowedProductIds: null };
    if (context.kind === 'catalog') {
      const catalog = await this.catalogs.publicCatalog(tenantId, context.slug);
      return { source: 'CATALOG', catalogId: catalog.id, catalogLinkId: null, allowedProductIds: new Set(catalog.productIds) };
    }
    const { link } = await this.catalogs.resolveLink(context.token);
    if (link.tenantId !== tenantId) throw notFound('Link');
    return { source: 'CATALOG_LINK', catalogId: link.catalogId, catalogLinkId: link.id, allowedProductIds: new Set(link.catalog.productIds) };
  }

  private async price(repos: Repositories, tenantId: string, input: QuoteInput, context: ResolvedContext): Promise<Quote> {
    if (!input.items.length) throw validation('Carrinho vazio');
    const quantities = new Map<string, number>();
    for (const item of input.items) quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);

    const found = new Map((await repos.variants.findManyForPricing(tenantId, [...quantities.keys()])).map((v) => [v.variant.id, v]));
    const lines: QuoteLine[] = [...quantities].map(([variantId, quantity]) => {
      const entry = found.get(variantId);
      if (!entry) {
        return { variantId, productId: null, productName: 'Item indisponível', productSlug: null, imageUrl: null, sku: null, variantLabel: '', size: null, color: null, unitPrice: ZERO, quantity, lineTotal: ZERO, availableStock: 0, problem: 'NOT_FOUND' };
      }
      const { variant, product } = entry;
      const unitPrice = effectiveUnitPrice(product, variant);
      let problem: LineProblem | null = null;
      if (!product.isActive || product.deletedAt || !variant.isActive) problem = 'UNAVAILABLE';
      else if (context.allowedProductIds && !context.allowedProductIds.has(product.id)) problem = 'NOT_IN_CATALOG';
      else if (variant.stock < quantity) problem = 'INSUFFICIENT_STOCK';
      return {
        variantId,
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        imageUrl: product.imageUrl,
        sku: variant.sku,
        variantLabel: variantLabel(variant),
        size: variant.size,
        color: variant.color,
        unitPrice,
        quantity,
        lineTotal: multiply(unitPrice, quantity),
        availableStock: Math.max(0, variant.stock),
        problem,
      };
    });

    const valid = lines.every((l) => l.problem === null);
    const subtotal = sum(lines.filter((l) => l.problem === null).map((l) => l.lineTotal));
    const settings = await repos.tenants.getSettings(tenantId);
    const shipping =
      subtotal === 0
        ? ZERO
        : (await this.shipping.quote({ tenantId, subtotal, destinationZipCode: input.zipCode, itemCount: lines.length })).amount;
    const discount = ZERO; // cupons ainda não implementados (ver roadmap)
    return { currency: settings.currency, lines, subtotal, shipping, discount, total: sum([subtotal, shipping]), valid };
  }
}
