import { Prisma } from '../../generated/prisma/client.js';
import type { FinanceRepository } from '../../application/ports/repositories.js';
import { skipTake } from '../../shared/pagination.js';
import type { Db } from './client.js';
import { dec, mapTransaction, toCents, transactionInclude } from './mappers.js';

const zero = new Prisma.Decimal(0);

export const financeRepository = (db: Db): FinanceRepository => ({
  listCategories: (tenantId) =>
    db.financeCategory.findMany({
      where: { tenantId },
      select: { id: true, name: true, kind: true, isSystem: true },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    }),
  findCategory: (tenantId, id) => db.financeCategory.findFirst({ where: { tenantId, id }, select: { id: true, name: true, kind: true, isSystem: true } }),
  findSystemCategory: (tenantId, kind, name) =>
    db.financeCategory.findFirst({ where: { tenantId, kind, name }, select: { id: true, name: true, kind: true, isSystem: true } }),
  createCategory: (tenantId, data) =>
    db.financeCategory.create({ data: { ...data, tenantId }, select: { id: true, name: true, kind: true, isSystem: true } }),
  async createTransaction(tenantId, data) {
    const row = await db.financialTransaction.create({ data: { ...data, tenantId, amount: dec(data.amount) }, include: transactionInclude });
    return mapTransaction(row);
  },
  async ensureIncomeForPayment(tenantId, data) {
    const existing = await db.financialTransaction.findUnique({ where: { paymentId: data.paymentId }, select: { id: true } });
    if (existing) return false;
    try {
      await db.financialTransaction.create({
        data: { ...data, tenantId, kind: 'INCOME', status: 'PAID', amount: dec(data.amount), createdById: null },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  },
  async cancelIncomeForPayment(tenantId, paymentId) {
    await db.financialTransaction.updateMany({ where: { tenantId, paymentId }, data: { status: 'CANCELLED' } });
  },
  async findTransaction(tenantId, id) {
    const row = await db.financialTransaction.findFirst({ where: { tenantId, id }, include: transactionInclude });
    return row && mapTransaction(row);
  },
  async updateTransaction(tenantId, id, data) {
    const { count } = await db.financialTransaction.updateMany({ where: { tenantId, id }, data });
    if (!count) return null;
    return mapTransaction(await db.financialTransaction.findFirstOrThrow({ where: { tenantId, id }, include: transactionInclude }));
  },
  async listTransactions(tenantId, f, page) {
    const where: Prisma.FinancialTransactionWhereInput = {
      tenantId,
      ...(f.kind ? { kind: f.kind } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.from || f.to ? { competenceDate: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      db.financialTransaction.findMany({ where, include: transactionInclude, orderBy: [{ competenceDate: 'desc' }, { createdAt: 'desc' }], ...skipTake(page) }),
      db.financialTransaction.count({ where }),
    ]);
    return { items: rows.map(mapTransaction), total };
  },
  async sumPaid(tenantId, kind, from, to) {
    const r = await db.financialTransaction.aggregate({ where: { tenantId, kind, status: 'PAID', paidAt: { gte: from, lt: to } }, _sum: { amount: true } });
    return toCents(r._sum.amount ?? zero);
  },
  async sumCompetence(tenantId, kind, from, to) {
    const r = await db.financialTransaction.aggregate({
      where: { tenantId, kind, status: { not: 'CANCELLED' }, competenceDate: { gte: from, lt: to } },
      _sum: { amount: true },
    });
    return toCents(r._sum.amount ?? zero);
  },
  async cashflow(tenantId, from, to, groupBy) {
    const unit = groupBy === 'day' ? 'day' : 'month';
    const rows = await db.$queryRaw<{ period: Date; income: Prisma.Decimal; expense: Prisma.Decimal }[]>`
      SELECT date_trunc(${unit}, "paidAt" AT TIME ZONE 'UTC') AS period,
             COALESCE(SUM(CASE WHEN "kind" = 'INCOME' THEN "amount" END), 0) AS income,
             COALESCE(SUM(CASE WHEN "kind" = 'EXPENSE' THEN "amount" END), 0) AS expense
        FROM "FinancialTransaction"
       WHERE "tenantId" = ${tenantId}::uuid AND "status" = 'PAID' AND "paidAt" >= ${from} AND "paidAt" < ${to}
    GROUP BY 1
    ORDER BY 1`;
    return rows.map((r) => ({
      period: r.period.toISOString().slice(0, groupBy === 'day' ? 10 : 7),
      income: toCents(new Prisma.Decimal(r.income)),
      expense: toCents(new Prisma.Decimal(r.expense)),
    }));
  },
});
