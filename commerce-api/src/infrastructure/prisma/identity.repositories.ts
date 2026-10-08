import type { RefreshTokenRepository, TenantRepository, UserRepository } from '../../application/ports/repositories.js';
import type { Db } from './client.js';
import { dec, decOrNull, mapSettings } from './mappers.js';

const userSelect = { id: true, email: true, name: true, passwordHash: true, isActive: true, isPlatformAdmin: true } as const;
const tenantSelect = { id: true, slug: true, name: true, status: true } as const;

/** Categorias financeiras criadas para toda loja nova. "Vendas" recebe as receitas de pedidos. */
const DEFAULT_FINANCE_CATEGORIES = [
  { name: 'Vendas', kind: 'INCOME' as const, isSystem: true },
  { name: 'Outras receitas', kind: 'INCOME' as const, isSystem: false },
  { name: 'Fornecedores', kind: 'EXPENSE' as const, isSystem: false },
  { name: 'Frete e envio', kind: 'EXPENSE' as const, isSystem: false },
  { name: 'Marketing', kind: 'EXPENSE' as const, isSystem: false },
  { name: 'Taxas e tarifas', kind: 'EXPENSE' as const, isSystem: false },
  { name: 'Operacional', kind: 'EXPENSE' as const, isSystem: false },
];

export const userRepository = (db: Db): UserRepository => ({
  findByEmail: (email) => db.user.findUnique({ where: { email }, select: userSelect }),
  findById: (id) => db.user.findUnique({ where: { id }, select: userSelect }),
  create: (data) => db.user.create({ data: { ...data, email: data.email.toLowerCase() }, select: userSelect }),
  async markLogin(id, at) {
    await db.user.update({ where: { id }, data: { lastLoginAt: at } });
  },
});

export const refreshTokenRepository = (db: Db): RefreshTokenRepository => ({
  async create(data) {
    await db.refreshToken.create({ data });
  },
  findByHash: (tokenHash) =>
    db.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, familyId: true, expiresAt: true, revokedAt: true, rotatedAt: true },
    }),
  async markRotated(id, at) {
    const { count } = await db.refreshToken.updateMany({ where: { id, rotatedAt: null, revokedAt: null }, data: { rotatedAt: at } });
    return count === 1;
  },
  async revokeFamily(familyId, at) {
    await db.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: at } });
  },
});

export const tenantRepository = (db: Db): TenantRepository => ({
  findById: (id) => db.tenant.findUnique({ where: { id }, select: tenantSelect }),
  findBySlug: (slug) => db.tenant.findUnique({ where: { slug }, select: tenantSelect }),
  createWithOwner: ({ slug, name, ownerUserId }) =>
    db.tenant.create({
      data: {
        slug,
        name,
        settings: { create: {} },
        memberships: { create: { userId: ownerUserId, role: 'OWNER' } },
        financeCategories: { create: DEFAULT_FINANCE_CATEGORIES },
      },
      select: tenantSelect,
    }),
  async listMemberships(userId) {
    const rows = await db.membership.findMany({
      where: { userId },
      select: { role: true, tenant: { select: tenantSelect } },
      orderBy: { tenant: { name: 'asc' } },
    });
    return rows;
  },
  async findRole(userId, tenantId) {
    const row = await db.membership.findUnique({ where: { userId_tenantId: { userId, tenantId } }, select: { role: true } });
    return row?.role ?? null;
  },
  async listMembers(tenantId) {
    const rows = await db.membership.findMany({
      where: { tenantId },
      select: { role: true, createdAt: true, user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({ userId: r.user.id, email: r.user.email, name: r.user.name, role: r.role, createdAt: r.createdAt }));
  },
  async upsertMember(tenantId, userId, role) {
    await db.membership.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      create: { userId, tenantId, role },
      update: { role },
    });
  },
  async removeMember(tenantId, userId) {
    const { count } = await db.membership.deleteMany({ where: { tenantId, userId } });
    return count > 0;
  },
  countOwners: (tenantId) => db.membership.count({ where: { tenantId, role: 'OWNER' } }),
  async getSettings(tenantId) {
    const row = await db.tenantSettings.upsert({ where: { tenantId }, create: { tenantId }, update: {} });
    return mapSettings(row);
  },
  async updateSettings(tenantId, data) {
    const { shippingFlatRate, freeShippingThreshold, ...rest } = data;
    const patch = {
      ...rest,
      ...(shippingFlatRate !== undefined ? { shippingFlatRate: dec(shippingFlatRate) } : {}),
      ...(freeShippingThreshold !== undefined ? { freeShippingThreshold: decOrNull(freeShippingThreshold) } : {}),
    };
    const row = await db.tenantSettings.upsert({ where: { tenantId }, create: { tenantId, ...patch }, update: patch });
    return mapSettings(row);
  },
});
