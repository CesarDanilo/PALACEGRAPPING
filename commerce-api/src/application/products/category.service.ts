import { conflict, notFound, validation } from '../../shared/errors.js';
import { authorize, type TenantContext } from '../context.js';
import type { UnitOfWork } from '../ports/repositories.js';
import type { CategoryRecord } from '../ports/records.js';

export type CategoryInput = Omit<CategoryRecord, 'id' | 'tenantId'>;

export class CategoryService {
  constructor(private readonly uow: UnitOfWork) {}

  list(ctx: TenantContext) {
    authorize(ctx, 'catalog:read');
    return this.uow.repos.categories.list(ctx.tenantId, { onlyActive: false });
  }

  async create(ctx: TenantContext, input: CategoryInput) {
    authorize(ctx, 'catalog:write');
    await this.assertParent(ctx.tenantId, input.parentId, null);
    if (await this.uow.repos.categories.findBySlug(ctx.tenantId, input.slug)) {
      throw conflict('Já existe uma categoria com este slug');
    }
    return this.uow.repos.categories.create(ctx.tenantId, input);
  }

  async update(ctx: TenantContext, id: string, patch: Partial<CategoryInput>) {
    authorize(ctx, 'catalog:write');
    if (patch.parentId !== undefined) await this.assertParent(ctx.tenantId, patch.parentId, id);
    if (patch.slug) {
      const other = await this.uow.repos.categories.findBySlug(ctx.tenantId, patch.slug);
      if (other && other.id !== id) throw conflict('Já existe uma categoria com este slug');
    }
    const updated = await this.uow.repos.categories.update(ctx.tenantId, id, patch);
    if (!updated) throw notFound('Categoria');
    return updated;
  }

  private async assertParent(tenantId: string, parentId: string | null, selfId: string | null) {
    if (!parentId) return;
    if (parentId === selfId) throw validation('Uma categoria não pode ser pai de si mesma');
    const parent = await this.uow.repos.categories.findById(tenantId, parentId);
    if (!parent) throw notFound('Categoria pai');
  }
}
