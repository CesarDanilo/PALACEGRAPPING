import { notFound } from '../../shared/errors.js';
import type { Pagination } from '../../shared/pagination.js';
import { toPage } from '../../shared/pagination.js';
import type { ProductFilter, UnitOfWork } from '../ports/repositories.js';
import type { TenantRecord } from '../ports/records.js';

/** Leitura pública da vitrine de uma loja. Nunca retorna produtos inativos ou excluídos. */
export class StorefrontService {
  constructor(private readonly uow: UnitOfWork) {}

  /** Resolve a loja pública pelo slug (cabeçalho X-Store). Lojas suspensas não aparecem. */
  async resolveStore(slug: string): Promise<TenantRecord> {
    const tenant = await this.uow.repos.tenants.findBySlug(slug);
    if (!tenant || tenant.status !== 'ACTIVE') throw notFound('Loja');
    return tenant;
  }

  async storeInfo(tenant: TenantRecord) {
    const settings = await this.uow.repos.tenants.getSettings(tenant.id);
    return {
      slug: tenant.slug,
      name: tenant.name,
      currency: settings.currency,
      shipping: {
        mode: settings.shippingMode,
        flatRate: settings.shippingFlatRate,
        freeShippingThreshold: settings.freeShippingThreshold,
      },
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      termsUrl: settings.termsUrl,
    };
  }

  categories(tenantId: string) {
    return this.uow.repos.categories.list(tenantId, { onlyActive: true });
  }

  async products(tenantId: string, filter: Omit<ProductFilter, 'publicOnly' | 'categoryId'> & { categorySlug?: string }, page: Pagination) {
    const { categorySlug, ...rest } = filter;
    let categoryId: string | undefined;
    if (categorySlug) {
      const category = await this.uow.repos.categories.findBySlug(tenantId, categorySlug);
      if (!category || !category.isActive) throw notFound('Categoria');
      categoryId = category.id;
    }
    const { items, total } = await this.uow.repos.products.list(tenantId, { ...rest, categoryId, publicOnly: true }, page);
    return toPage(items, total, page);
  }

  async product(tenantId: string, slug: string) {
    const product = await this.uow.repos.products.findBySlug(tenantId, slug);
    if (!product || !product.isActive || product.deletedAt) throw notFound('Produto');
    const related = await this.uow.repos.products.related(tenantId, product, 4);
    return { product: { ...product, variants: product.variants.filter((v) => v.isActive) }, related };
  }
}
