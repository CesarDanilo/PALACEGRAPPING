import type { RequestHandler, Router } from 'express';
import { z } from 'zod';
import type { CheckoutStart } from '../../../application/payments/payment.service.js';
import type { Container } from '../../../container.js';
import { PAYMENT_METHODS } from '../../../domain/payments/payment-status.js';
import { AppError } from '../../../shared/errors.js';
import { checkoutLimiter, storeOf } from '../middlewares.js';
import { centsSchema, route, slugSchema, type Access } from '../route-kit.js';
import { publicCatalog, publicOrder, publicProduct } from '../serializers.js';
import { productListQuery } from './catalog.routes.js';

const digits = (v: string) => v.replace(/\D/g, '');

const contextSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('storefront') }),
    z.object({ kind: z.literal('catalog'), slug: slugSchema }),
    z.object({ kind: z.literal('link'), token: z.string().min(20).max(100) }),
  ])
  .default({ kind: 'storefront' });

const cartSchema = z.object({
  items: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(20) })).min(1).max(50),
  zipCode: z.string().transform(digits).pipe(z.string().length(8)).nullable().default(null),
  context: contextSchema,
});

const orderSchema = cartSchema.extend({
  customer: z.object({
    name: z.string().trim().min(3).max(120),
    phone: z.string().transform(digits).pipe(z.string().min(10).max(13)),
    email: z.email().max(254).nullable().default(null),
  }),
  address: z.object({
    zipCode: z.string().transform(digits).pipe(z.string().length(8)),
    street: z.string().trim().min(2).max(160),
    number: z.string().trim().min(1).max(20),
    complement: z.string().trim().max(80).nullable().default(null),
    district: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().length(2).toUpperCase(),
  }),
  paymentMethod: z.enum(PAYMENT_METHODS),
  notes: z.string().trim().max(500).nullable().default(null),
  acceptTerms: z.literal(true, 'É preciso aceitar os termos e políticas'),
  expectedTotal: centsSchema.nullable().default(null),
});

const storeHeader = { name: 'X-Store', required: true, description: 'Slug público da loja' };
const orderTokenHeader = { name: 'X-Order-Token', required: true, description: 'Token de acompanhamento recebido no checkout' };

function paymentView(start: CheckoutStart) {
  if (start.status === 'READY') return { status: 'READY' as const, method: start.payment.method, checkoutUrl: start.payment.checkoutUrl };
  if (start.status === 'NOT_CONFIGURED') return { status: 'NOT_CONFIGURED' as const, message: 'Pagamento online ainda não configurado nesta loja; o pedido aguarda contato.' };
  return { status: 'FAILED' as const, message: start.message };
}

export function registerPublicRoutes(router: Router, guards: Record<Access, RequestHandler[]>, c: Container) {
  const { storefront, catalogs, checkout, payments } = c.services;
  const limiter = checkoutLimiter(c.env.NODE_ENV !== 'test');

  route(router, guards, { method: 'get', path: '/public/store', tag: 'Vitrine', summary: 'Dados públicos da loja (moeda, regra de frete, contato).', access: 'store', headers: [storeHeader] },
    async ({ req }) => storefront.storeInfo(storeOf(req)));

  route(router, guards, { method: 'get', path: '/public/categories', tag: 'Vitrine', summary: 'Categorias ativas.', access: 'store', headers: [storeHeader] },
    async ({ req }) => ({
      items: (await storefront.categories(storeOf(req).id)).map(({ id, name, slug, description, parentId, position }) => ({ id, name, slug, description, parentId, position })),
    }));

  route(router, guards, {
    method: 'get', path: '/public/products', tag: 'Vitrine', summary: 'Produtos da vitrine com filtros, ordenação e paginação.', access: 'store', headers: [storeHeader],
    query: productListQuery.extend({ category: slugSchema.optional() }),
  }, async ({ query, req }) => {
    const { page, pageSize, category, ...filter } = query;
    const result = await storefront.products(storeOf(req).id, { ...filter, categorySlug: category }, { page, pageSize });
    return { ...result, items: result.items.map(publicProduct) };
  });

  route(router, guards, {
    method: 'get', path: '/public/products/{slug}', tag: 'Vitrine', summary: 'Detalhe do produto e relacionados.', access: 'store', headers: [storeHeader],
    params: z.object({ slug: slugSchema }),
  }, async ({ params, req }) => {
    const { product, related } = await storefront.product(storeOf(req).id, params.slug);
    return { product: publicProduct(product), related: related.map(publicProduct) };
  });

  route(router, guards, {
    method: 'get', path: '/public/catalogs/{slug}', tag: 'Vitrine', summary: 'Catálogo público compartilhável e seus produtos.', access: 'store', headers: [storeHeader],
    params: z.object({ slug: slugSchema }),
    query: productListQuery,
  }, async ({ params, query, req }) => {
    const tenant = storeOf(req);
    const catalog = await catalogs.publicCatalog(tenant.id, params.slug);
    const { page, pageSize, ...filter } = query;
    const products = await storefront.products(tenant.id, { ...filter, catalogId: catalog.id }, { page, pageSize });
    return { catalog: publicCatalog(catalog), products: { ...products, items: products.items.map(publicProduct) } };
  });

  route(router, guards, {
    method: 'get', path: '/public/catalog-links/{token}', tag: 'Vitrine', summary: 'Resolve link exclusivo: loja, catálogo e produtos. Não concede acesso administrativo.', access: 'public',
    params: z.object({ token: z.string().min(20).max(100) }),
    query: productListQuery,
  }, async ({ params, query }) => {
    const { link, tenant } = await catalogs.resolveLink(params.token);
    const { page, pageSize, ...filter } = query;
    const products = await storefront.products(tenant.id, { ...filter, catalogId: link.catalogId }, { page, pageSize });
    return {
      store: { slug: tenant.slug, name: tenant.name },
      link: { label: link.label, expiresAt: link.expiresAt },
      catalog: publicCatalog(link.catalog),
      products: { ...products, items: products.items.map(publicProduct) },
    };
  });

  route(router, guards, {
    method: 'post', path: '/checkout/quote', tag: 'Checkout', summary: 'Recalcula carrinho com preços e estoque do servidor (não reserva).', access: 'store', headers: [storeHeader],
    before: [limiter], body: cartSchema,
  }, async ({ body, req }) => checkout.quote(storeOf(req).id, body));

  route(router, guards, {
    method: 'post', path: '/checkout/orders', tag: 'Checkout', summary: 'Cria o pedido: valida preço e estoque, baixa estoque e inicia o pagamento.', access: 'store', status: 201,
    headers: [storeHeader, { name: 'Idempotency-Key', required: true, description: 'Chave única por tentativa de compra (UUID gerado pelo cliente)' }],
    before: [limiter], body: orderSchema,
  }, async ({ body, req, res }) => {
    const key = req.header('idempotency-key');
    if (!key || !/^[\w-]{16,100}$/.test(key)) throw new AppError('VALIDATION_ERROR', 'Cabeçalho Idempotency-Key ausente ou inválido');
    const tenant = storeOf(req);
    const placed = await checkout.placeOrder(tenant.id, body, key);
    const start = placed.order.status === 'PENDING_PAYMENT' ? await payments.startCheckout(placed.order) : null;
    // Repetição com a mesma Idempotency-Key: 200 com o pedido original.
    if (placed.replayed) res.locals.status = 200;
    return {
      order: publicOrder(placed.order),
      trackingToken: placed.trackingToken,
      replayed: placed.replayed,
      payment: start ? paymentView(start) : null,
    };
  });

  route(router, guards, {
    method: 'get', path: '/public/orders/{number}', tag: 'Checkout', summary: 'Acompanhamento do pedido (exige X-Order-Token).', access: 'store',
    headers: [storeHeader, orderTokenHeader], params: z.object({ number: z.string().min(4).max(30) }),
  }, async ({ params, req }) => {
    const token = req.header('x-order-token') ?? '';
    const order = await checkout.findTrackedOrder(storeOf(req).id, params.number, token);
    const [latest] = await c.uow.repos.payments.listForOrder(order.tenantId, order.id);
    return publicOrder(order, latest);
  });

  route(router, guards, {
    method: 'post', path: '/payments', tag: 'Pagamentos', summary: 'Inicia (ou retoma) o pagamento de um pedido pendente.', access: 'store',
    headers: [storeHeader, orderTokenHeader], before: [limiter],
    body: z.object({ orderNumber: z.string().min(4).max(30), method: z.enum(PAYMENT_METHODS).optional() }),
  }, async ({ body, req }) => {
    const order = await checkout.findTrackedOrder(storeOf(req).id, body.orderNumber, req.header('x-order-token') ?? '');
    return paymentView(await payments.startCheckout(order, body.method));
  });

  route(router, guards, {
    method: 'post', path: '/webhooks/payments/{provider}', tag: 'Pagamentos', summary: 'Notificações do provedor (assinatura obrigatória, idempotente).', access: 'webhook',
    params: z.object({ provider: z.string().regex(/^[a-z0-9-]{2,30}$/) }),
  }, async ({ params, req }) => {
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
    const query = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, typeof v === 'string' ? v : undefined]));
    return payments.handleWebhook(params.provider, { headers, query, body: req.body });
  });
}
