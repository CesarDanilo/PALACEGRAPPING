import type { RequestHandler, Router } from 'express';
import { z } from 'zod';
import type { Container } from '../../../container.js';
import { ORDER_STATUSES } from '../../../domain/orders/order-status.js';
import { paginationQuery } from '../../../shared/pagination.js';
import { ctxOf } from '../middlewares.js';
import { centsSchema, idParams, isoDate, route, type Access } from '../route-kit.js';
import { adminOrderSummary } from '../serializers.js';

/** Período padrão: mês corrente (UTC). `to` é exclusivo. */
const periodQuery = z
  .object({ from: isoDate.optional(), to: isoDate.optional() })
  .transform(({ from, to }) => {
    const now = new Date();
    const start = from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = to ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { from: start, to: end };
  });

const entryBody = z.object({
  categoryId: z.uuid().nullable().default(null),
  description: z.string().trim().min(2).max(200),
  amount: centsSchema.refine((v) => v > 0, 'Valor deve ser positivo'),
  competenceDate: isoDate,
  paidAt: isoDate.nullable().default(null),
  paymentMethod: z.string().trim().max(40).nullable().default(null),
});

export function registerOperationsRoutes(router: Router, guards: Record<Access, RequestHandler[]>, c: Container) {
  const { customers, orders, finance, dashboard } = c.services;

  route(router, guards, { method: 'get', path: '/dashboard', tag: 'Painel', summary: 'Indicadores do período, pendências, estoque baixo e atividade recente.', access: 'tenant', query: periodQuery },
    async ({ query, req }) => dashboard.overview(ctxOf(req), query));

  // ── Clientes ──
  route(router, guards, {
    method: 'get', path: '/customers', tag: 'Clientes', summary: 'Lista clientes.', access: 'tenant',
    query: paginationQuery.extend({ search: z.string().trim().max(100).optional() }),
  }, async ({ query, req }) => customers.list(ctxOf(req), query.search, { page: query.page, pageSize: query.pageSize }));

  route(router, guards, { method: 'get', path: '/customers/{id}', tag: 'Clientes', summary: 'Cliente e seus pedidos.', access: 'tenant', params: idParams },
    async ({ params, req }) => {
      const result = await customers.get(ctxOf(req), params.id);
      return { customer: result.customer, orders: result.orders.map(adminOrderSummary) };
    });

  // ── Pedidos ──
  route(router, guards, {
    method: 'get', path: '/orders', tag: 'Pedidos', summary: 'Lista pedidos.', access: 'tenant',
    query: paginationQuery.extend({
      status: z.enum(ORDER_STATUSES).optional(),
      search: z.string().trim().max(100).optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
    }),
  }, async ({ query, req }) => {
    const { page, pageSize, ...filter } = query;
    const result = await orders.list(ctxOf(req), filter, { page, pageSize });
    return { ...result, items: result.items.map(adminOrderSummary) };
  });

  route(router, guards, { method: 'get', path: '/orders/{id}', tag: 'Pedidos', summary: 'Pedido com itens, histórico e pagamentos.', access: 'tenant', params: idParams },
    async ({ params, req }) => {
      const result = await orders.get(ctxOf(req), params.id);
      return { ...result, order: adminOrderSummary(result.order) };
    });

  route(router, guards, {
    method: 'patch', path: '/orders/{id}/status', tag: 'Pedidos', summary: 'Muda o status (preparo, envio, entrega, cancelamento, devolução).', access: 'tenant', params: idParams,
    body: z.object({
      status: z.enum(['PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']),
      note: z.string().trim().max(500).nullable().optional(),
      shippingCarrier: z.string().trim().max(80).nullable().optional(),
      trackingCode: z.string().trim().max(80).nullable().optional(),
      restock: z.boolean().optional(),
    }),
  }, async ({ params, body, req }) => {
    const result = await orders.changeStatus(ctxOf(req), params.id, body);
    return { ...result, order: adminOrderSummary(result.order) };
  });

  route(router, guards, {
    method: 'patch', path: '/orders/{id}/shipping', tag: 'Pedidos', summary: 'Atualiza transportadora e código de rastreio.', access: 'tenant', params: idParams,
    body: z.object({ shippingCarrier: z.string().trim().max(80).nullable(), trackingCode: z.string().trim().max(80).nullable() }),
  }, async ({ params, body, req }) => {
    const result = await orders.updateShipping(ctxOf(req), params.id, body);
    return { ...result, order: adminOrderSummary(result.order) };
  });

  // ── Financeiro ──
  route(router, guards, { method: 'get', path: '/finance/summary', tag: 'Financeiro', summary: 'Resumo do período (critérios no README).', access: 'tenant', query: periodQuery },
    async ({ query, req }) => finance.summary(ctxOf(req), query));

  route(router, guards, {
    method: 'get', path: '/finance/transactions', tag: 'Financeiro', summary: 'Lançamentos (receitas e despesas) por competência.', access: 'tenant',
    query: paginationQuery.extend({
      kind: z.enum(['INCOME', 'EXPENSE']).optional(),
      status: z.enum(['PENDING', 'PAID', 'CANCELLED']).optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
    }),
  }, async ({ query, req }) => {
    const { page, pageSize, ...filter } = query;
    return finance.transactions(ctxOf(req), filter, { page, pageSize });
  });

  route(router, guards, { method: 'post', path: '/finance/expenses', tag: 'Financeiro', summary: 'Registra despesa.', access: 'tenant', status: 201, body: entryBody },
    async ({ body, req }) => finance.createExpense(ctxOf(req), body));

  route(router, guards, { method: 'post', path: '/finance/incomes', tag: 'Financeiro', summary: 'Registra receita avulsa (fora de pedidos).', access: 'tenant', status: 201, body: entryBody },
    async ({ body, req }) => finance.createIncome(ctxOf(req), body));

  route(router, guards, {
    method: 'patch', path: '/finance/transactions/{id}', tag: 'Financeiro', summary: 'Marca lançamento como pago, pendente ou cancelado.', access: 'tenant', params: idParams,
    body: z.object({ status: z.enum(['PENDING', 'PAID', 'CANCELLED']), paidAt: isoDate.nullable().optional() }),
  }, async ({ params, body, req }) => finance.updateStatus(ctxOf(req), params.id, body));

  route(router, guards, { method: 'get', path: '/finance/categories', tag: 'Financeiro', summary: 'Categorias financeiras.', access: 'tenant' },
    async ({ req }) => ({ items: await finance.categories(ctxOf(req)) }));

  route(router, guards, {
    method: 'post', path: '/finance/categories', tag: 'Financeiro', summary: 'Cria categoria financeira.', access: 'tenant', status: 201,
    body: z.object({ name: z.string().trim().min(2).max(60), kind: z.enum(['INCOME', 'EXPENSE']) }),
  }, async ({ body, req }) => finance.createCategory(ctxOf(req), body));

  route(router, guards, {
    method: 'get', path: '/finance/reports/cashflow', tag: 'Financeiro', summary: 'Fluxo de caixa (lançamentos pagos) por dia ou mês.', access: 'tenant',
    query: z.object({ from: isoDate.optional(), to: isoDate.optional(), groupBy: z.enum(['day', 'month']).default('month') }),
  }, async ({ query, req }) => {
    const period = periodQuery.parse({ from: query.from, to: query.to });
    return { items: await finance.cashflow(ctxOf(req), period, query.groupBy) };
  });
}
