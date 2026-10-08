import { authorize, type TenantContext } from '../context.js';
import type { FinanceService, Period } from '../finance/finance.service.js';
import type { UnitOfWork } from '../ports/repositories.js';

export class DashboardService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly finance: FinanceService,
  ) {}

  async overview(ctx: TenantContext, period: Period) {
    authorize(ctx, 'orders:read');
    const { orders, payments, variants, tenants } = this.uow.repos;
    const settings = await tenants.getSettings(ctx.tenantId);
    const canSeeFinance = ctx.role !== 'OPERATOR';
    const [pendingOrders, toFulfil, awaitingPayments, lowStock, activity, finance] = await Promise.all([
      orders.countByStatus(ctx.tenantId, ['PENDING_PAYMENT']),
      orders.countByStatus(ctx.tenantId, ['PAID', 'PREPARING']),
      payments.countByStatus(ctx.tenantId, 'PENDING'),
      variants.lowStock(ctx.tenantId, settings.lowStockThreshold, 10),
      orders.recentActivity(ctx.tenantId, 15),
      canSeeFinance ? this.finance.summary(ctx, period) : Promise.resolve(null),
    ]);
    return { period, pendingOrders, toFulfil, awaitingPayments, lowStock, activity, finance };
  }
}
