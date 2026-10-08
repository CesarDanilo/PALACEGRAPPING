import { catalogIsOpen, linkUnavailableReason } from '../../domain/catalog/catalog-link.js';
import { AppError, conflict, notFound, validation } from '../../shared/errors.js';
import { randomToken } from '../../shared/crypto.js';
import { authorize, type TenantContext } from '../context.js';
import type { CatalogWrite, UnitOfWork } from '../ports/repositories.js';
import type { Clock } from '../ports/services.js';

const reasonMessages = {
  INACTIVE: 'Este link foi desativado',
  EXPIRED: 'Este link expirou',
  USAGE_LIMIT: 'Este link atingiu o limite de utilizações',
  CATALOG_UNAVAILABLE: 'Esta seleção não está disponível no momento',
} as const;

export class CatalogService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  list(ctx: TenantContext) {
    authorize(ctx, 'catalog:read');
    return this.uow.repos.catalogs.list(ctx.tenantId);
  }

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, 'catalog:read');
    const catalog = await this.uow.repos.catalogs.findById(ctx.tenantId, id);
    if (!catalog) throw notFound('Catálogo');
    return catalog;
  }

  async create(ctx: TenantContext, data: CatalogWrite, productIds: string[] = []) {
    authorize(ctx, 'catalog:write');
    this.assertWindow(data.startsAt, data.endsAt);
    if (await this.uow.repos.catalogs.findBySlug(ctx.tenantId, data.slug)) throw conflict('Já existe um catálogo com este slug');
    await this.assertProducts(ctx.tenantId, productIds);
    return this.uow.transaction(async (repos) => {
      const catalog = await repos.catalogs.create(ctx.tenantId, data);
      if (productIds.length) await repos.catalogs.setProducts(ctx.tenantId, catalog.id, productIds);
      return { ...catalog, productIds };
    });
  }

  async update(ctx: TenantContext, id: string, patch: Partial<CatalogWrite>) {
    authorize(ctx, 'catalog:write');
    const current = await this.get(ctx, id);
    this.assertWindow(patch.startsAt !== undefined ? patch.startsAt : current.startsAt, patch.endsAt !== undefined ? patch.endsAt : current.endsAt);
    if (patch.slug && patch.slug !== current.slug && (await this.uow.repos.catalogs.findBySlug(ctx.tenantId, patch.slug))) {
      throw conflict('Já existe um catálogo com este slug');
    }
    const updated = await this.uow.repos.catalogs.update(ctx.tenantId, id, patch);
    if (!updated) throw notFound('Catálogo');
    return updated;
  }

  async setProducts(ctx: TenantContext, id: string, productIds: string[]) {
    authorize(ctx, 'catalog:write');
    await this.get(ctx, id);
    await this.assertProducts(ctx.tenantId, productIds);
    await this.uow.repos.catalogs.setProducts(ctx.tenantId, id, productIds);
    return this.get(ctx, id);
  }

  async addProduct(ctx: TenantContext, id: string, productId: string) {
    authorize(ctx, 'catalog:write');
    await this.get(ctx, id);
    await this.assertProducts(ctx.tenantId, [productId]);
    await this.uow.repos.catalogs.addProduct(ctx.tenantId, id, productId);
  }

  async removeProduct(ctx: TenantContext, id: string, productId: string) {
    authorize(ctx, 'catalog:write');
    await this.get(ctx, id);
    await this.uow.repos.catalogs.removeProduct(ctx.tenantId, id, productId);
  }

  // ── Links exclusivos ──

  listLinks(ctx: TenantContext, catalogId?: string) {
    authorize(ctx, 'catalog:read');
    return this.uow.repos.catalogLinks.list(ctx.tenantId, catalogId);
  }

  async createLink(ctx: TenantContext, data: { catalogId: string; label: string; expiresAt: Date | null; maxUses: number | null }) {
    authorize(ctx, 'catalog:write');
    await this.get(ctx, data.catalogId);
    if (data.expiresAt && data.expiresAt <= this.clock.now()) throw validation('A expiração deve estar no futuro');
    return this.uow.repos.catalogLinks.create(ctx.tenantId, { ...data, token: randomToken(), createdById: ctx.userId });
  }

  async updateLink(ctx: TenantContext, id: string, patch: { label?: string; expiresAt?: Date | null; maxUses?: number | null; isActive?: boolean }) {
    authorize(ctx, 'catalog:write');
    const updated = await this.uow.repos.catalogLinks.update(ctx.tenantId, id, patch);
    if (!updated) throw notFound('Link');
    return updated;
  }

  // ── Acesso público ──

  /** Catálogo público por slug. Catálogos privados só abrem por link exclusivo. */
  async publicCatalog(tenantId: string, slug: string) {
    const catalog = await this.uow.repos.catalogs.findBySlug(tenantId, slug);
    if (!catalog || !catalog.isPublic || !catalogIsOpen(catalog, this.clock.now())) throw notFound('Catálogo');
    return catalog;
  }

  /** Catálogos públicos abertos agora (vitrine de coleções e campanhas). */
  async publicCatalogs(tenantId: string) {
    const now = this.clock.now();
    return (await this.uow.repos.catalogs.list(tenantId)).filter((c) => c.isPublic && catalogIsOpen(c, now));
  }

  /** Resolve um token de link exclusivo. O token identifica a loja e o catálogo, nada além disso. */
  async resolveLink(token: string) {
    const link = await this.uow.repos.catalogLinks.findByToken(token);
    if (!link) throw notFound('Link');
    const tenant = await this.uow.repos.tenants.findById(link.tenantId);
    if (!tenant || tenant.status !== 'ACTIVE') throw notFound('Link');
    const reason = linkUnavailableReason(link, this.clock.now());
    if (reason) throw new AppError('LINK_UNAVAILABLE', reasonMessages[reason], { reason });
    return { link, tenant };
  }

  private assertWindow(startsAt: Date | null, endsAt: Date | null) {
    if (startsAt && endsAt && endsAt <= startsAt) throw validation('O fim deve ser posterior ao início');
  }

  private async assertProducts(tenantId: string, ids: string[]) {
    if (!ids.length) return;
    const existing = await this.uow.repos.products.existingIds(tenantId, ids);
    const missing = ids.filter((id) => !existing.has(id));
    if (missing.length) throw notFound(`Produto(s) ${missing.join(', ')}`);
  }
}
