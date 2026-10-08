import { notFound } from '../../shared/errors.js';
import type { Pagination } from '../../shared/pagination.js';
import { toPage } from '../../shared/pagination.js';
import { authorize, type TenantContext } from '../context.js';
import type { UnitOfWork } from '../ports/repositories.js';

export class CustomerService {
  constructor(private readonly uow: UnitOfWork) {}

  async list(ctx: TenantContext, search: string | undefined, page: Pagination) {
    authorize(ctx, 'customers:read');
    const { items, total } = await this.uow.repos.customers.list(ctx.tenantId, search, page);
    return toPage(items, total, page);
  }

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, 'customers:read');
    const customer = await this.uow.repos.customers.findById(ctx.tenantId, id);
    if (!customer) throw notFound('Cliente');
    const { items: orders } = await this.uow.repos.orders.list(ctx.tenantId, { customerId: id }, { page: 1, pageSize: 50 });
    return { customer, orders };
  }
}
