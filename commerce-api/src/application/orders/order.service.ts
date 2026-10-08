import { assertTransition, MANUAL_TRANSITIONS, releasesStock, type OrderStatus } from '../../domain/orders/order-status.js';
import { AppError, conflict, notFound, validation } from '../../shared/errors.js';
import type { Pagination } from '../../shared/pagination.js';
import { toPage } from '../../shared/pagination.js';
import { authorize, type TenantContext } from '../context.js';
import type { OrderFilter, Repositories, UnitOfWork } from '../ports/repositories.js';
import type { OrderRecord } from '../ports/records.js';
import type { Clock } from '../ports/services.js';

export interface Actor {
  userId: string | null;
  source: string;
}

export interface StatusChange {
  status: OrderStatus;
  note?: string | null;
  shippingCarrier?: string | null;
  trackingCode?: string | null;
  /** Em devoluções: reintegra as unidades ao estoque após conferência física. */
  restock?: boolean;
}

/**
 * Aplica uma transição de status com seus efeitos (estoque e histórico) dentro
 * de uma transação já aberta. Usado pelo painel, pelos webhooks e pela varredura
 * de expiração, para que as regras sejam as mesmas em todos os caminhos.
 */
export async function applyTransition(
  repos: Repositories,
  order: OrderRecord,
  change: StatusChange,
  actor: Actor,
  now: Date,
): Promise<boolean> {
  assertTransition(order.status, change.status);
  const patch: Parameters<Repositories['orders']['transition']>[4] = {};
  if (change.status === 'PAID') patch.paidAt = now;
  if (change.status === 'SHIPPED') {
    patch.shippedAt = now;
    if (change.shippingCarrier !== undefined) patch.shippingCarrier = change.shippingCarrier;
    if (change.trackingCode !== undefined) patch.trackingCode = change.trackingCode;
  }
  if (change.status === 'DELIVERED') patch.deliveredAt = now;
  if (change.status === 'CANCELLED' || change.status === 'EXPIRED') patch.cancelledAt = now;

  const moved = await repos.orders.transition(order.tenantId, order.id, order.status, change.status, patch);
  if (!moved) return false;

  const restock = releasesStock(order.status, change.status) || (change.status === 'RETURNED' && change.restock === true);
  if (restock) {
    for (const item of order.items) {
      if (!item.variantId) continue;
      const balance = await repos.variants.applyStockDelta(order.tenantId, item.variantId, item.quantity);
      if (balance == null) continue; // variante removida: nada a reintegrar
      await repos.stockMovements.create(order.tenantId, {
        variantId: item.variantId,
        type: change.status === 'RETURNED' ? 'RETURN' : 'RELEASE',
        quantity: item.quantity,
        balanceAfter: balance,
        reason: `Pedido ${order.number} ${change.status === 'RETURNED' ? 'devolvido' : change.status === 'EXPIRED' ? 'expirado' : 'cancelado'}`,
        orderId: order.id,
        userId: actor.userId,
        source: actor.source,
      });
    }
  }
  if (change.status === 'CANCELLED' || change.status === 'EXPIRED') {
    await repos.payments.expirePendingForOrder(order.tenantId, order.id);
  }
  await repos.orders.addHistory(order.tenantId, {
    orderId: order.id,
    fromStatus: order.status,
    toStatus: change.status,
    note: change.note ?? null,
    userId: actor.userId,
    source: actor.source,
  });
  return true;
}

export class OrderService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async list(ctx: TenantContext, filter: OrderFilter, page: Pagination) {
    authorize(ctx, 'orders:read');
    const { items, total } = await this.uow.repos.orders.list(ctx.tenantId, filter, page);
    return toPage(items, total, page);
  }

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, 'orders:read');
    const order = await this.uow.repos.orders.findById(ctx.tenantId, id);
    if (!order) throw notFound('Pedido');
    const [history, payments] = await Promise.all([
      this.uow.repos.orders.history(ctx.tenantId, id),
      this.uow.repos.payments.listForOrder(ctx.tenantId, id),
    ]);
    return { order, history, payments };
  }

  /** Mudança manual de status. PAID/EXPIRED não podem ser definidos manualmente. */
  async changeStatus(ctx: TenantContext, id: string, change: StatusChange) {
    authorize(ctx, 'orders:write');
    if (!MANUAL_TRANSITIONS.has(change.status)) {
      throw validation(`O status ${change.status} só é definido pelo sistema (pagamento ou expiração)`);
    }
    await this.uow.transaction(async (repos) => {
      const order = await repos.orders.findById(ctx.tenantId, id);
      if (!order) throw notFound('Pedido');
      const moved = await applyTransition(repos, order, change, { userId: ctx.userId, source: 'admin' }, this.clock.now());
      if (!moved) throw conflict('O pedido foi alterado por outro processo; recarregue e tente novamente');
    });
    return this.get(ctx, id);
  }

  async updateShipping(ctx: TenantContext, id: string, data: { shippingCarrier: string | null; trackingCode: string | null }) {
    authorize(ctx, 'orders:write');
    const order = await this.uow.repos.orders.findById(ctx.tenantId, id);
    if (!order) throw notFound('Pedido');
    if (['CANCELLED', 'EXPIRED', 'RETURNED'].includes(order.status)) {
      throw new AppError('INVALID_STATE_TRANSITION', 'Pedido encerrado não aceita dados de envio');
    }
    await this.uow.repos.orders.updateShipping(ctx.tenantId, id, data);
    return this.get(ctx, id);
  }

  /**
   * Expira pedidos que passaram do prazo de pagamento e devolve o estoque.
   * Idempotente e segura para rodar em várias instâncias (transição condicional).
   */
  async expireOverdue(limit = 100): Promise<number> {
    const now = this.clock.now();
    const due = await this.uow.repos.orders.findExpired(now, limit);
    let expired = 0;
    for (const { id, tenantId } of due) {
      const done = await this.uow.transaction(async (repos) => {
        const order = await repos.orders.findById(tenantId, id);
        if (!order || order.status !== 'PENDING_PAYMENT') return false;
        return applyTransition(repos, order, { status: 'EXPIRED', note: 'Prazo de pagamento esgotado' }, { userId: null, source: 'expiration-job' }, now);
      });
      if (done) expired++;
    }
    return expired;
  }
}
