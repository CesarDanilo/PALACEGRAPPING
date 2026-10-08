import { canAssignRole, type Role } from '../../domain/access/permissions.js';
import { AppError, conflict, forbidden, notFound } from '../../shared/errors.js';
import type { Cents } from '../../shared/money.js';
import { authorize, type TenantContext } from '../context.js';
import type { UnitOfWork } from '../ports/repositories.js';
import type { TenantSettingsRecord } from '../ports/records.js';
import type { PasswordHasher } from '../ports/services.js';

export interface AddMemberInput {
  email: string;
  role: Role;
  /** Necessários apenas quando o usuário ainda não existe. */
  name?: string;
  password?: string;
}

export type SettingsPatch = Partial<{
  currency: string;
  orderNumberPrefix: string;
  shippingMode: 'FLAT_RATE' | 'FREE';
  shippingFlatRate: Cents;
  freeShippingThreshold: Cents | null;
  pendingPaymentTtlMinutes: number;
  lowStockThreshold: number;
  contactEmail: string | null;
  contactPhone: string | null;
  termsUrl: string | null;
}>;

export class TenantService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
  ) {}

  async listForUser(userId: string) {
    return this.uow.repos.tenants.listMemberships(userId);
  }

  /** Criação de lojas é restrita a administradores da plataforma. */
  async create(userId: string, data: { slug: string; name: string }) {
    const user = await this.uow.repos.users.findById(userId);
    if (!user?.isPlatformAdmin) throw forbidden('Somente administradores da plataforma criam lojas');
    if (await this.uow.repos.tenants.findBySlug(data.slug)) throw conflict('Já existe uma loja com este slug');
    return this.uow.repos.tenants.createWithOwner({ ...data, ownerUserId: userId });
  }

  async current(ctx: TenantContext) {
    const tenant = await this.uow.repos.tenants.findById(ctx.tenantId);
    if (!tenant) throw notFound('Loja');
    return { tenant, role: ctx.role };
  }

  async listMembers(ctx: TenantContext) {
    authorize(ctx, 'members:manage');
    return this.uow.repos.tenants.listMembers(ctx.tenantId);
  }

  async addMember(ctx: TenantContext, input: AddMemberInput) {
    authorize(ctx, 'members:manage');
    if (!canAssignRole(ctx.role, input.role)) throw forbidden('Você não pode atribuir este papel');
    const email = input.email.trim().toLowerCase();
    let user = await this.uow.repos.users.findByEmail(email);
    if (!user) {
      if (!input.name || !input.password) {
        throw new AppError('VALIDATION_ERROR', 'Usuário novo: informe nome e senha inicial');
      }
      user = await this.uow.repos.users.create({ email, name: input.name, passwordHash: await this.hasher.hash(input.password) });
    }
    await this.uow.repos.tenants.upsertMember(ctx.tenantId, user.id, input.role);
    return { userId: user.id, email: user.email, name: user.name, role: input.role };
  }

  async changeRole(ctx: TenantContext, userId: string, role: Role) {
    authorize(ctx, 'members:manage');
    if (!canAssignRole(ctx.role, role)) throw forbidden('Você não pode atribuir este papel');
    await this.uow.transaction(async (repos) => {
      const current = await repos.tenants.findRole(userId, ctx.tenantId);
      if (!current) throw notFound('Membro');
      if (current === 'OWNER' && role !== 'OWNER' && (await repos.tenants.countOwners(ctx.tenantId)) <= 1) {
        throw conflict('A loja precisa de pelo menos um proprietário');
      }
      await repos.tenants.upsertMember(ctx.tenantId, userId, role);
    });
  }

  async removeMember(ctx: TenantContext, userId: string) {
    authorize(ctx, 'members:manage');
    await this.uow.transaction(async (repos) => {
      const current = await repos.tenants.findRole(userId, ctx.tenantId);
      if (!current) throw notFound('Membro');
      if (current === 'OWNER' && (await repos.tenants.countOwners(ctx.tenantId)) <= 1) {
        throw conflict('A loja precisa de pelo menos um proprietário');
      }
      await repos.tenants.removeMember(ctx.tenantId, userId);
    });
  }

  async getSettings(ctx: TenantContext): Promise<TenantSettingsRecord> {
    authorize(ctx, 'catalog:read');
    return this.uow.repos.tenants.getSettings(ctx.tenantId);
  }

  async updateSettings(ctx: TenantContext, patch: SettingsPatch) {
    authorize(ctx, 'settings:write');
    return this.uow.repos.tenants.updateSettings(ctx.tenantId, patch);
  }
}
