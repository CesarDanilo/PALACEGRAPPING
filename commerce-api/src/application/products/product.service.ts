import { randomUUID } from 'node:crypto';
import { pricingProblem } from '../../domain/products/product-rules.js';
import { AppError, conflict, notFound, validation } from '../../shared/errors.js';
import type { Cents } from '../../shared/money.js';
import type { Pagination } from '../../shared/pagination.js';
import { toPage } from '../../shared/pagination.js';
import { authorize, type TenantContext } from '../context.js';
import type { ProductFilter, ProductWrite, UnitOfWork, VariantWrite } from '../ports/repositories.js';
import type { Clock, ObjectStorage } from '../ports/services.js';

export interface ImageUpload {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
  alt: string;
  variantId: string | null;
}

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/** Confere a assinatura binária do arquivo (não confia só no Content-Type enviado). */
export function sniffImageType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.toString('ascii', 4, 8) === 'ftyp' && /avi[fs]/.test(buffer.toString('ascii', 8, 12))) return 'image/avif';
  return null;
}

export class ProductService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly storage: ObjectStorage,
    private readonly clock: Clock,
    private readonly maxUploadBytes: number,
  ) {}

  async list(ctx: TenantContext, filter: Omit<ProductFilter, 'publicOnly'>, page: Pagination) {
    authorize(ctx, 'catalog:read');
    const { items, total } = await this.uow.repos.products.list(ctx.tenantId, { ...filter, publicOnly: false }, page);
    return toPage(items, total, page);
  }

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, 'catalog:read');
    const product = await this.uow.repos.products.findById(ctx.tenantId, id);
    if (!product) throw notFound('Produto');
    return product;
  }

  async create(ctx: TenantContext, data: ProductWrite, variants: (VariantWrite & { stock: number })[]) {
    authorize(ctx, 'catalog:write');
    this.assertPricing(data.price, data.salePrice);
    for (const v of variants) if (v.price != null) this.assertPricing(v.price, v.salePrice);
    await this.assertCategory(ctx.tenantId, data.categoryId);
    if (await this.uow.repos.products.findBySlug(ctx.tenantId, data.slug)) throw conflict('Já existe um produto com este slug');
    const skus = variants.map((v) => v.sku);
    if (new Set(skus).size !== skus.length) throw validation('SKUs repetidos no mesmo produto');

    return this.uow.transaction(async (repos) => {
      const product = await repos.products.create(ctx.tenantId, data, variants);
      // Estoque inicial também é uma movimentação registrada.
      for (const variant of product.variants) {
        if (variant.stock > 0) {
          await repos.stockMovements.create(ctx.tenantId, {
            variantId: variant.id,
            type: 'INBOUND',
            quantity: variant.stock,
            balanceAfter: variant.stock,
            reason: 'Estoque inicial',
            orderId: null,
            userId: ctx.userId,
            source: 'admin',
          });
        }
      }
      return product;
    });
  }

  async update(ctx: TenantContext, id: string, patch: Partial<ProductWrite>) {
    authorize(ctx, 'catalog:write');
    const current = await this.get(ctx, id);
    if (patch.price !== undefined || patch.salePrice !== undefined) {
      this.assertPricing(patch.price ?? current.price, patch.salePrice !== undefined ? patch.salePrice : current.salePrice);
    }
    if (patch.categoryId !== undefined) await this.assertCategory(ctx.tenantId, patch.categoryId);
    if (patch.slug && patch.slug !== current.slug && (await this.uow.repos.products.findBySlug(ctx.tenantId, patch.slug))) {
      throw conflict('Já existe um produto com este slug');
    }
    const updated = await this.uow.repos.products.update(ctx.tenantId, id, patch);
    if (!updated) throw notFound('Produto');
    return updated;
  }

  /** Desativação lógica: o produto sai da vitrine e da administração, mas pedidos antigos continuam íntegros. */
  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, 'catalog:write');
    const ok = await this.uow.repos.products.softDelete(ctx.tenantId, id, this.clock.now());
    if (!ok) throw notFound('Produto');
  }

  async addVariant(ctx: TenantContext, productId: string, data: VariantWrite & { stock: number }) {
    authorize(ctx, 'catalog:write');
    await this.get(ctx, productId);
    if (data.price != null) this.assertPricing(data.price, data.salePrice);
    const { stock, ...variant } = data;
    return this.uow.transaction(async (repos) => {
      const created = await repos.variants.create(ctx.tenantId, productId, variant);
      if (stock > 0) {
        const balance = await repos.variants.applyStockDelta(ctx.tenantId, created.id, stock);
        await repos.stockMovements.create(ctx.tenantId, {
          variantId: created.id,
          type: 'INBOUND',
          quantity: stock,
          balanceAfter: balance ?? stock,
          reason: 'Estoque inicial',
          orderId: null,
          userId: ctx.userId,
          source: 'admin',
        });
        created.stock = balance ?? stock;
      }
      return created;
    });
  }

  /** Estoque não é editável aqui: use movimentações (InventoryService) para manter o histórico. */
  async updateVariant(ctx: TenantContext, productId: string, variantId: string, patch: Partial<VariantWrite>) {
    authorize(ctx, 'catalog:write');
    const variant = await this.uow.repos.variants.findById(ctx.tenantId, variantId);
    if (!variant || variant.productId !== productId) throw notFound('Variante');
    const price = patch.price !== undefined ? patch.price : variant.price;
    const salePrice = patch.salePrice !== undefined ? patch.salePrice : variant.salePrice;
    if (price != null) this.assertPricing(price, salePrice);
    const updated = await this.uow.repos.variants.update(ctx.tenantId, variantId, patch);
    if (!updated) throw notFound('Variante');
    return updated;
  }

  async addImage(ctx: TenantContext, productId: string, upload: ImageUpload) {
    authorize(ctx, 'catalog:write');
    if (!this.storage.configured) throw new AppError('SERVICE_UNAVAILABLE', 'Armazenamento de imagens não configurado');
    const product = await this.get(ctx, productId);
    if (upload.sizeBytes > this.maxUploadBytes) throw new AppError('PAYLOAD_TOO_LARGE', 'Imagem acima do tamanho permitido');
    const sniffed = sniffImageType(upload.buffer);
    if (!sniffed || !ALLOWED_IMAGE_TYPES[sniffed] || sniffed !== upload.mimeType) {
      throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Envie JPEG, PNG, WebP ou AVIF válidos');
    }
    if (upload.variantId && !product.variants.some((v) => v.id === upload.variantId)) throw notFound('Variante');

    const path = `${ctx.tenantId}/products/${productId}/${randomUUID()}.${ALLOWED_IMAGE_TYPES[sniffed]}`;
    const stored = await this.storage.upload(path, upload.buffer, sniffed);
    try {
      const nextPosition = product.images.reduce((max, i) => Math.max(max, i.position + 1), 0);
      const image = await this.uow.repos.images.create(ctx.tenantId, {
        productId,
        variantId: upload.variantId,
        storagePath: stored.path,
        url: stored.publicUrl,
        alt: upload.alt || product.name,
        position: nextPosition,
        isPrimary: false,
        mimeType: sniffed,
        sizeBytes: upload.sizeBytes,
      });
      if (!product.images.some((i) => i.isPrimary)) {
        await this.uow.repos.images.setPrimary(ctx.tenantId, productId, image.id);
        image.isPrimary = true;
      }
      return image;
    } catch (error) {
      // Não deixa arquivo órfão no bucket se o metadado falhar.
      await this.storage.remove([stored.path]).catch(() => undefined);
      throw error;
    }
  }

  async updateImage(ctx: TenantContext, productId: string, imageId: string, patch: { alt?: string; position?: number; isPrimary?: boolean; variantId?: string | null }) {
    authorize(ctx, 'catalog:write');
    const { isPrimary, ...rest } = patch;
    const image = await this.uow.repos.images.update(ctx.tenantId, productId, imageId, rest);
    if (!image) throw notFound('Imagem');
    if (isPrimary) {
      await this.uow.repos.images.setPrimary(ctx.tenantId, productId, imageId);
      image.isPrimary = true;
    }
    return image;
  }

  async removeImage(ctx: TenantContext, productId: string, imageId: string) {
    authorize(ctx, 'catalog:write');
    const image = await this.uow.repos.images.findById(ctx.tenantId, productId, imageId);
    if (!image) throw notFound('Imagem');
    await this.uow.repos.images.delete(ctx.tenantId, productId, imageId);
    if (image.isPrimary) {
      const [next] = await this.uow.repos.images.listForProduct(ctx.tenantId, productId);
      if (next) await this.uow.repos.images.setPrimary(ctx.tenantId, productId, next.id);
    }
    if (this.storage.configured) await this.storage.remove([image.storagePath]);
  }

  private assertPricing(price: Cents, salePrice: Cents | null) {
    const problem = pricingProblem({ price, salePrice });
    if (problem) throw validation(problem);
  }

  private async assertCategory(tenantId: string, categoryId: string | null) {
    if (categoryId && !(await this.uow.repos.categories.findById(tenantId, categoryId))) throw notFound('Categoria');
  }
}
