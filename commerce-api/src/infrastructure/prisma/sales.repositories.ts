import { Prisma } from '../../generated/prisma/client.js';
import type {
  CustomerRepository,
  OrderRepository,
  PaymentEventRepository,
  PaymentRepository,
} from '../../application/ports/repositories.js';
import { skipTake } from '../../shared/pagination.js';
import type { Db } from './client.js';
import { dec, mapOrder, mapPayment, orderInclude, toCents } from './mappers.js';

const SALE_STATUSES = ['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'RETURNED'] as const;

export const customerRepository = (db: Db): CustomerRepository => ({
  async list(tenantId, search, page) {
    const where: Prisma.CustomerWhereInput = {
      tenantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search.replace(/\D/g, '') || search } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      db.customer.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(page) }),
      db.customer.count({ where }),
    ]);
    const stats = rows.length
      ? await db.order.groupBy({
          by: ['customerId'],
          where: { tenantId, customerId: { in: rows.map((r) => r.id) }, status: { in: [...SALE_STATUSES] } },
          _count: { _all: true },
          _sum: { total: true },
        })
      : [];
    const byCustomer = new Map(stats.map((s) => [s.customerId, s]));
    return {
      items: rows.map((r) => {
        const s = byCustomer.get(r.id);
        return {
          id: r.id,
          tenantId: r.tenantId,
          name: r.name,
          phone: r.phone,
          email: r.email,
          createdAt: r.createdAt,
          orderCount: s?._count._all ?? 0,
          totalSpent: s?._sum.total ? toCents(s._sum.total) : toCents(new Prisma.Decimal(0)),
        };
      }),
      total,
    };
  },
  async findById(tenantId, id) {
    const row = await db.customer.findFirst({ where: { tenantId, id } });
    if (!row) return null;
    const stats = await db.order.aggregate({
      where: { tenantId, customerId: id, status: { in: [...SALE_STATUSES] } },
      _count: { _all: true },
      _sum: { total: true },
    });
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      phone: row.phone,
      email: row.email,
      createdAt: row.createdAt,
      orderCount: stats._count._all,
      totalSpent: toCents(stats._sum.total ?? new Prisma.Decimal(0)),
    };
  },
  async upsertByPhone(tenantId, data) {
    const row = await db.customer.upsert({
      where: { tenantId_phone: { tenantId, phone: data.phone } },
      create: { tenantId, ...data },
      update: { name: data.name, ...(data.email ? { email: data.email } : {}) },
      select: { id: true },
    });
    return row;
  },
  async addAddress(tenantId, customerId, a) {
    const existing = await db.address.findFirst({
      where: { tenantId, customerId, zipCode: a.zipCode, street: a.street, number: a.number, complement: a.complement },
      select: { id: true },
    });
    if (!existing) await db.address.create({ data: { tenantId, customerId, ...a } });
  },
});

export const orderRepository = (db: Db): OrderRepository => ({
  async create(tenantId, data) {
    const { address, items, subtotal, shippingTotal, discountTotal, total, ...rest } = data;
    const row = await db.order.create({
      data: {
        ...rest,
        tenantId,
        subtotal: dec(subtotal),
        shippingTotal: dec(shippingTotal),
        discountTotal: dec(discountTotal),
        total: dec(total),
        shipZipCode: address.zipCode,
        shipStreet: address.street,
        shipNumber: address.number,
        shipComplement: address.complement,
        shipDistrict: address.district,
        shipCity: address.city,
        shipState: address.state,
        items: {
          create: items.map((i) => ({ ...i, tenantId, unitPrice: dec(i.unitPrice), lineTotal: dec(i.lineTotal) })),
        },
      },
      include: orderInclude,
    });
    return mapOrder(row);
  },
  async findById(tenantId, id) {
    const row = await db.order.findFirst({ where: { tenantId, id }, include: orderInclude });
    return row && mapOrder(row);
  },
  async findByNumber(tenantId, number) {
    const row = await db.order.findUnique({ where: { tenantId_number: { tenantId, number } }, include: orderInclude });
    return row && mapOrder(row);
  },
  async findByIdempotencyKey(tenantId, key) {
    const row = await db.order.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: key } }, include: orderInclude });
    return row && mapOrder(row);
  },
  async list(tenantId, f, page) {
    const where: Prisma.OrderWhereInput = {
      tenantId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.customerId ? { customerId: f.customerId } : {}),
      ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
      ...(f.search
        ? {
            OR: [
              { number: { contains: f.search, mode: 'insensitive' } },
              { customerName: { contains: f.search, mode: 'insensitive' } },
              { customerEmail: { contains: f.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      db.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, ...skipTake(page) }),
      db.order.count({ where }),
    ]);
    return { items: rows.map(mapOrder), total };
  },
  async transition(tenantId, id, from, to, patch) {
    const { count } = await db.order.updateMany({ where: { tenantId, id, status: from }, data: { ...patch, status: to } });
    return count === 1;
  },
  async updateShipping(tenantId, id, data) {
    await db.order.updateMany({ where: { tenantId, id }, data });
  },
  async addHistory(tenantId, data) {
    await db.orderStatusHistory.create({ data: { ...data, tenantId } });
  },
  async history(tenantId, orderId) {
    const rows = await db.orderStatusHistory.findMany({
      where: { tenantId, orderId },
      include: { order: { select: { number: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(({ order, tenantId: _t, ...h }) => ({ ...h, orderNumber: order.number }));
  },
  async recentActivity(tenantId, limit) {
    const rows = await db.orderStatusHistory.findMany({
      where: { tenantId },
      include: { order: { select: { number: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(({ order, tenantId: _t, ...h }) => ({ ...h, orderNumber: order.number }));
  },
  findExpired: (now, limit) =>
    db.order.findMany({
      where: { status: 'PENDING_PAYMENT', paymentExpiresAt: { lte: now } },
      select: { id: true, tenantId: true },
      orderBy: { paymentExpiresAt: 'asc' },
      take: limit,
    }),
  countByStatus: (tenantId, statuses) => db.order.count({ where: { tenantId, status: { in: statuses } } }),
  async stats(tenantId, from, to) {
    const [created, paid] = await Promise.all([
      db.order.aggregate({ where: { tenantId, createdAt: { gte: from, lt: to } }, _count: { _all: true }, _sum: { total: true } }),
      db.order.aggregate({ where: { tenantId, paidAt: { gte: from, lt: to } }, _count: { _all: true }, _sum: { total: true } }),
    ]);
    const zero = new Prisma.Decimal(0);
    return {
      createdCount: created._count._all,
      createdTotal: toCents(created._sum.total ?? zero),
      paidCount: paid._count._all,
      paidTotal: toCents(paid._sum.total ?? zero),
    };
  },
});

export const paymentRepository = (db: Db): PaymentRepository => ({
  async create(tenantId, data) {
    return mapPayment(await db.payment.create({ data: { ...data, tenantId, amount: dec(data.amount) } }));
  },
  async attachCheckout(tenantId, id, data) {
    await db.payment.updateMany({ where: { tenantId, id }, data });
  },
  async findByExternalReference(externalReference) {
    const row = await db.payment.findUnique({ where: { externalReference } });
    return row && mapPayment(row);
  },
  async listForOrder(tenantId, orderId) {
    const rows = await db.payment.findMany({ where: { tenantId, orderId }, orderBy: { createdAt: 'desc' } });
    return rows.map(mapPayment);
  },
  async lock(tenantId, id) {
    const locked = await db.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Payment" WHERE "id" = ${id}::uuid AND "tenantId" = ${tenantId}::uuid FOR UPDATE`;
    if (!locked.length) return null;
    const row = await db.payment.findUnique({ where: { id } });
    return row && mapPayment(row);
  },
  async update(tenantId, id, data) {
    const patch = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    await db.payment.updateMany({ where: { tenantId, id }, data: patch });
  },
  async expirePendingForOrder(tenantId, orderId) {
    await db.payment.updateMany({ where: { tenantId, orderId, status: { in: ['PENDING', 'REJECTED'] } }, data: { status: 'EXPIRED' } });
  },
  countByStatus: (tenantId, status) => db.payment.count({ where: { tenantId, status } }),
});

export const paymentEventRepository = (db: Db): PaymentEventRepository => ({
  async begin({ provider, eventKey, type, payload }) {
    const existing = await db.paymentEvent.findUnique({ where: { provider_eventKey: { provider, eventKey } }, select: { id: true, processedAt: true } });
    if (existing) return existing.processedAt ? null : { id: existing.id };
    try {
      return await db.paymentEvent.create({
        data: { provider, eventKey, type, payload: (payload ?? {}) as Prisma.InputJsonValue },
        select: { id: true },
      });
    } catch (error) {
      // Duas entregas simultâneas do mesmo evento: só uma processa.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
      throw error;
    }
  },
  async finish(id, data) {
    await db.paymentEvent.update({ where: { id }, data: { ...data, processedAt: new Date() } });
  },
});
