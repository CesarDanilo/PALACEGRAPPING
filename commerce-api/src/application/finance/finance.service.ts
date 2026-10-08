import { conflict, notFound, validation } from '../../shared/errors.js';
import { type Cents, sum } from '../../shared/money.js';
import type { Pagination } from '../../shared/pagination.js';
import { toPage } from '../../shared/pagination.js';
import { authorize, type TenantContext } from '../context.js';
import type { TransactionFilter, UnitOfWork } from '../ports/repositories.js';

export interface EntryInput {
  categoryId: string | null;
  description: string;
  amount: Cents;
  competenceDate: Date;
  /** Quando informado, o lançamento já está pago/recebido nesta data. */
  paidAt: Date | null;
  paymentMethod: string | null;
}

export interface Period {
  from: Date;
  /** Exclusivo. */
  to: Date;
}

/**
 * Indicadores financeiros. Cada número tem um critério único (ver README > Financeiro):
 *  - ordersCreated: pedidos criados no período (qualquer status), valor bruto.
 *  - salesApproved: pedidos com pagamento aprovado no período (paidAt).
 *  - received: receitas efetivamente recebidas (status PAID por data de recebimento).
 *  - expensesPaid: despesas pagas no período (por data de pagamento).
 *  - expensesByCompetence: despesas não canceladas cuja competência cai no período.
 *  - cashResult: received − expensesPaid (regime de caixa). Não é lucro contábil:
 *    custo de mercadoria vendida, impostos e taxas do provedor não são modelados.
 */
export class FinanceService {
  constructor(private readonly uow: UnitOfWork) {}

  categories(ctx: TenantContext) {
    authorize(ctx, 'finance:read');
    return this.uow.repos.finance.listCategories(ctx.tenantId);
  }

  async createCategory(ctx: TenantContext, data: { name: string; kind: 'INCOME' | 'EXPENSE' }) {
    authorize(ctx, 'finance:write');
    const exists = (await this.uow.repos.finance.listCategories(ctx.tenantId)).some(
      (c) => c.kind === data.kind && c.name.toLowerCase() === data.name.toLowerCase(),
    );
    if (exists) throw conflict('Categoria já existe');
    return this.uow.repos.finance.createCategory(ctx.tenantId, data);
  }

  createExpense(ctx: TenantContext, input: EntryInput) {
    return this.createEntry(ctx, 'EXPENSE', input);
  }

  /** Receitas avulsas (fora de pedidos). Receitas de pedidos são criadas pelos webhooks de pagamento. */
  createIncome(ctx: TenantContext, input: EntryInput) {
    return this.createEntry(ctx, 'INCOME', input);
  }

  async transactions(ctx: TenantContext, filter: TransactionFilter, page: Pagination) {
    authorize(ctx, 'finance:read');
    const { items, total } = await this.uow.repos.finance.listTransactions(ctx.tenantId, filter, page);
    return toPage(items, total, page);
  }

  async updateStatus(ctx: TenantContext, id: string, data: { status: 'PENDING' | 'PAID' | 'CANCELLED'; paidAt?: Date | null }) {
    authorize(ctx, 'finance:write');
    const current = await this.uow.repos.finance.findTransaction(ctx.tenantId, id);
    if (!current) throw notFound('Lançamento');
    if (current.paymentId) throw validation('Receitas de pagamentos são controladas pelo provedor');
    if (data.status === 'PAID' && !data.paidAt && !current.paidAt) throw validation('Informe a data de pagamento');
    return this.uow.repos.finance.updateTransaction(ctx.tenantId, id, {
      status: data.status,
      paidAt: data.status === 'PAID' ? (data.paidAt ?? current.paidAt) : data.status === 'PENDING' ? null : current.paidAt,
    });
  }

  async summary(ctx: TenantContext, period: Period) {
    authorize(ctx, 'finance:read');
    if (period.to <= period.from) throw validation('Período inválido');
    const { finance, orders } = this.uow.repos;
    const [stats, received, expensesPaid, expensesByCompetence, incomeByCompetence] = await Promise.all([
      orders.stats(ctx.tenantId, period.from, period.to),
      finance.sumPaid(ctx.tenantId, 'INCOME', period.from, period.to),
      finance.sumPaid(ctx.tenantId, 'EXPENSE', period.from, period.to),
      finance.sumCompetence(ctx.tenantId, 'EXPENSE', period.from, period.to),
      finance.sumCompetence(ctx.tenantId, 'INCOME', period.from, period.to),
    ]);
    return {
      period,
      ordersCreated: { count: stats.createdCount, total: stats.createdTotal },
      salesApproved: { count: stats.paidCount, total: stats.paidTotal },
      received,
      incomeByCompetence,
      expensesPaid,
      expensesByCompetence,
      cashResult: sum([received, (-expensesPaid) as Cents]),
    };
  }

  cashflow(ctx: TenantContext, period: Period, groupBy: 'day' | 'month') {
    authorize(ctx, 'finance:read');
    if (period.to <= period.from) throw validation('Período inválido');
    return this.uow.repos.finance.cashflow(ctx.tenantId, period.from, period.to, groupBy);
  }

  private async createEntry(ctx: TenantContext, kind: 'INCOME' | 'EXPENSE', input: EntryInput) {
    authorize(ctx, 'finance:write');
    if (input.amount <= 0) throw validation('Valor deve ser positivo');
    if (input.categoryId) {
      const category = await this.uow.repos.finance.findCategory(ctx.tenantId, input.categoryId);
      if (!category) throw notFound('Categoria financeira');
      if (category.kind !== kind) throw validation('Categoria de tipo diferente do lançamento');
    }
    return this.uow.repos.finance.createTransaction(ctx.tenantId, {
      kind,
      categoryId: input.categoryId,
      description: input.description,
      amount: input.amount,
      competenceDate: input.competenceDate,
      paidAt: input.paidAt,
      status: input.paidAt ? 'PAID' : 'PENDING',
      paymentMethod: input.paymentMethod,
      orderId: null,
      paymentId: null,
      createdById: ctx.userId,
    });
  }
}
