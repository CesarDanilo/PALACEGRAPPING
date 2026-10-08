import { AppError, notFound, validation } from '../../shared/errors.js';
import type { Pagination } from '../../shared/pagination.js';
import { toPage } from '../../shared/pagination.js';
import { authorize, type TenantContext } from '../context.js';
import type { UnitOfWork } from '../ports/repositories.js';

export type ManualMovement =
  | { type: 'INBOUND'; quantity: number; reason: string }
  | { type: 'OUTBOUND'; quantity: number; reason: string }
  /** Ajuste de inventário: define o saldo absoluto contado. */
  | { type: 'ADJUSTMENT'; countedStock: number; reason: string };

export class InventoryService {
  constructor(private readonly uow: UnitOfWork) {}

  async move(ctx: TenantContext, variantId: string, movement: ManualMovement) {
    authorize(ctx, 'inventory:write');
    return this.uow.transaction(async (repos) => {
      const current = await repos.variants.lockStock(ctx.tenantId, variantId);
      if (current == null) throw notFound('Variante');

      let delta: number;
      if (movement.type === 'ADJUSTMENT') {
        if (movement.countedStock < 0) throw validation('Saldo contado não pode ser negativo');
        delta = movement.countedStock - current;
        if (delta === 0) return { balance: current, delta };
      } else {
        if (movement.quantity <= 0) throw validation('Quantidade deve ser positiva');
        delta = movement.type === 'INBOUND' ? movement.quantity : -movement.quantity;
      }

      const balance = await repos.variants.applyStockDelta(ctx.tenantId, variantId, delta);
      if (balance == null) {
        throw new AppError('INSUFFICIENT_STOCK', 'Saída maior que o saldo disponível', { available: current });
      }
      await repos.stockMovements.create(ctx.tenantId, {
        variantId,
        type: movement.type,
        quantity: delta,
        balanceAfter: balance,
        reason: movement.reason,
        orderId: null,
        userId: ctx.userId,
        source: 'admin',
      });
      return { balance, delta };
    });
  }

  async movements(ctx: TenantContext, filter: { variantId?: string; orderId?: string }, page: Pagination) {
    authorize(ctx, 'catalog:read');
    const { items, total } = await this.uow.repos.stockMovements.list(ctx.tenantId, filter, page);
    return toPage(items, total, page);
  }

  async lowStock(ctx: TenantContext, limit = 50) {
    authorize(ctx, 'catalog:read');
    const settings = await this.uow.repos.tenants.getSettings(ctx.tenantId);
    return this.uow.repos.variants.lowStock(ctx.tenantId, settings.lowStockThreshold, limit);
  }
}
