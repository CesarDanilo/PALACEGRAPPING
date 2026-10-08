import type { Prisma } from '../../generated/prisma/client.js';
import type {
  CatalogLinkRepository,
  CatalogRepository,
  CategoryRepository,
  ImageRepository,
  ProductFilter,
  ProductRepository,
  StockMovementRepository,
  VariantRepository,
  VariantWrite,
} from '../../application/ports/repositories.js';
import { skipTake } from '../../shared/pagination.js';
import type { Db } from './client.js';
import { catalogInclude, dec, decOrNull, mapCatalog, mapCategory, mapImage, mapProduct, mapVariant, productInclude, toCents, toCentsOrNull } from './mappers.js';

export const categoryRepository = (db: Db): CategoryRepository => ({
  async list(tenantId, { onlyActive }) {
    const rows = await db.category.findMany({
      where: { tenantId, ...(onlyActive ? { isActive: true } : {}) },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return rows.map(mapCategory);
  },
  async findById(tenantId, id) {
    const row = await db.category.findFirst({ where: { tenantId, id } });
    return row && mapCategory(row);
  },
  async findBySlug(tenantId, slug) {
    const row = await db.category.findUnique({ where: { tenantId_slug: { tenantId, slug } } });
    return row && mapCategory(row);
  },
  async create(tenantId, data) {
    return mapCategory(await db.category.create({ data: { ...data, tenantId } }));
  },
  async update(tenantId, id, data) {
    const { count } = await db.category.updateMany({ where: { tenantId, id }, data });
    if (!count) return null;
    return mapCategory(await db.category.findFirstOrThrow({ where: { tenantId, id } }));
  },
});

function productWhere(tenantId: string, f: ProductFilter): Prisma.ProductWhereInput {
  const variantFilter: Prisma.ProductVariantWhereInput = {
    ...(f.publicOnly ? { isActive: true } : {}),
    ...(f.size ? { size: { equals: f.size, mode: 'insensitive' } } : {}),
    ...(f.color ? { color: { equals: f.color, mode: 'insensitive' } } : {}),
    ...(f.inStock ? { stock: { gt: 0 } } : {}),
  };
  const needsVariant = f.publicOnly || f.size || f.color || f.inStock;
  return {
    tenantId,
    ...(f.includeDeleted ? {} : { deletedAt: null }),
    ...(f.publicOnly ? { isActive: true } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.line ? { line: { equals: f.line, mode: 'insensitive' } } : {}),
    ...(f.featured ? { isFeatured: true } : {}),
    ...(f.catalogId ? { catalogProducts: { some: { catalogId: f.catalogId } } } : {}),
    ...(f.search
      ? {
          OR: [
            { name: { contains: f.search, mode: 'insensitive' } },
            { tags: { has: f.search.toLowerCase() } },
            { variants: { some: { sku: { contains: f.search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
    ...(needsVariant ? { variants: { some: variantFilter } } : {}),
  };
}

function productOrder(sort: ProductFilter['sort']): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return [{ price: 'asc' }, { name: 'asc' }];
    case 'price_desc':
      return [{ price: 'desc' }, { name: 'asc' }];
    case 'newest':
      return [{ releasedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];
    default:
      return [{ isFeatured: 'desc' }, { createdAt: 'desc' }];
  }
}

const variantData = (v: Partial<VariantWrite>) => {
  const { price, salePrice, ...rest } = v;
  return {
    ...rest,
    ...(price !== undefined ? { price: decOrNull(price) } : {}),
    ...(salePrice !== undefined ? { salePrice: decOrNull(salePrice) } : {}),
  };
};

// Ordena tamanhos de forma natural: A0 < A1 < … , PP < P < M < G < GG < XG, números crescentes.
const LETTER_ORDER = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG'];
function sortSizes(sizes: string[]): string[] {
  const rank = (s: string) => {
    const letter = LETTER_ORDER.indexOf(s.toUpperCase());
    if (letter >= 0) return [1, letter] as const;
    const match = /^([A-Z]*)(\d+)$/i.exec(s);
    if (match) return [match[1] ? 0 : 2, Number(match[2]), match[1]!] as const;
    return [3, 0, s] as const;
  };
  return sizes.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
      const x = ra[i] ?? '';
      const y = rb[i] ?? '';
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  });
}

export const productRepository = (db: Db): ProductRepository => ({
  async list(tenantId, filter, page) {
    const where = productWhere(tenantId, filter);
    const [rows, total] = await Promise.all([
      db.product.findMany({ where, include: productInclude, orderBy: productOrder(filter.sort), ...skipTake(page) }),
      db.product.count({ where }),
    ]);
    return { items: rows.map(mapProduct), total };
  },
  async findById(tenantId, id) {
    const row = await db.product.findFirst({ where: { tenantId, id, deletedAt: null }, include: productInclude });
    return row && mapProduct(row);
  },
  async findBySlug(tenantId, slug) {
    const row = await db.product.findUnique({ where: { tenantId_slug: { tenantId, slug } }, include: productInclude });
    return row && mapProduct(row);
  },
  async related(tenantId, product, limit) {
    const rows = await db.product.findMany({
      where: {
        tenantId,
        id: { not: product.id },
        isActive: true,
        deletedAt: null,
        variants: { some: { isActive: true } },
        OR: [{ categoryId: product.categoryId ?? undefined }, { line: product.line ?? undefined }],
      },
      include: productInclude,
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return rows.map(mapProduct);
  },
  async create(tenantId, data, variants) {
    const row = await db.product.create({
      data: {
        ...data,
        tenantId,
        price: dec(data.price),
        salePrice: decOrNull(data.salePrice),
        variants: { create: variants.map((v) => ({ ...variantData(v), sku: v.sku, stock: v.stock, tenantId })) },
      },
      include: productInclude,
    });
    return mapProduct(row);
  },
  async update(tenantId, id, data) {
    const { price, salePrice, ...rest } = data;
    const { count } = await db.product.updateMany({
      where: { tenantId, id, deletedAt: null },
      data: {
        ...rest,
        ...(price !== undefined ? { price: dec(price) } : {}),
        ...(salePrice !== undefined ? { salePrice: decOrNull(salePrice) } : {}),
      },
    });
    if (!count) return null;
    return mapProduct(await db.product.findFirstOrThrow({ where: { tenantId, id }, include: productInclude }));
  },
  async softDelete(tenantId, id, at) {
    const { count } = await db.product.updateMany({ where: { tenantId, id, deletedAt: null }, data: { deletedAt: at, isActive: false } });
    return count > 0;
  },
  async facets(tenantId, catalogId) {
    const productWhere: Prisma.ProductWhereInput = {
      tenantId,
      isActive: true,
      deletedAt: null,
      ...(catalogId ? { catalogProducts: { some: { catalogId } } } : {}),
    };
    const [variants, lines] = await Promise.all([
      db.productVariant.findMany({
        where: { tenantId, isActive: true, product: productWhere },
        select: { size: true, color: true, colorHex: true },
        distinct: ['size', 'color'],
      }),
      db.product.findMany({ where: { ...productWhere, line: { not: null } }, select: { line: true }, distinct: ['line'] }),
    ]);
    const sizes = [...new Set(variants.map((v) => v.size).filter((s): s is string => Boolean(s)))];
    const colors = new Map<string, string | null>();
    for (const v of variants) if (v.color && !colors.has(v.color)) colors.set(v.color, v.colorHex);
    return {
      lines: lines.map((l) => l.line!).sort(),
      sizes: sortSizes(sizes),
      colors: [...colors].map(([name, hex]) => ({ name, hex })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    };
  },
  async existingIds(tenantId, ids) {
    const rows = await db.product.findMany({ where: { tenantId, id: { in: ids }, deletedAt: null }, select: { id: true } });
    return new Set(rows.map((r) => r.id));
  },
});

export const variantRepository = (db: Db): VariantRepository => ({
  async findById(tenantId, id) {
    const row = await db.productVariant.findFirst({ where: { tenantId, id } });
    return row && { ...mapVariant(row), tenantId: row.tenantId };
  },
  async findManyForPricing(tenantId, ids) {
    if (!ids.length) return [];
    const rows = await db.productVariant.findMany({
      where: { tenantId, id: { in: ids } },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            salePrice: true,
            isActive: true,
            deletedAt: true,
            images: { where: { isPrimary: true }, select: { url: true }, take: 1 },
          },
        },
      },
    });
    return rows.map((r) => ({
      variant: mapVariant(r),
      product: {
        id: r.product.id,
        name: r.product.name,
        slug: r.product.slug,
        price: toCents(r.product.price),
        salePrice: toCentsOrNull(r.product.salePrice),
        isActive: r.product.isActive,
        deletedAt: r.product.deletedAt,
        imageUrl: r.product.images[0]?.url ?? null,
      },
    }));
  },
  async create(tenantId, productId, data) {
    return mapVariant(await db.productVariant.create({ data: { ...variantData(data), sku: data.sku, tenantId, productId, stock: 0 } }));
  },
  async update(tenantId, id, data) {
    const { count } = await db.productVariant.updateMany({ where: { tenantId, id }, data: variantData(data) });
    if (!count) return null;
    return mapVariant(await db.productVariant.findFirstOrThrow({ where: { tenantId, id } }));
  },
  async applyStockDelta(tenantId, variantId, delta) {
    // Um único UPDATE condicional: a verificação e a baixa são atômicas, e o CHECK (stock >= 0)
    // do banco é a última barreira contra estoque negativo.
    const rows = await db.$queryRaw<{ stock: number }[]>`
      UPDATE "ProductVariant"
         SET "stock" = "stock" + ${delta}, "updatedAt" = now()
       WHERE "id" = ${variantId}::uuid AND "tenantId" = ${tenantId}::uuid AND "stock" + ${delta} >= 0
   RETURNING "stock"`;
    return rows[0]?.stock ?? null;
  },
  async lockStock(tenantId, variantId) {
    const rows = await db.$queryRaw<{ stock: number }[]>`
      SELECT "stock" FROM "ProductVariant" WHERE "id" = ${variantId}::uuid AND "tenantId" = ${tenantId}::uuid FOR UPDATE`;
    return rows[0]?.stock ?? null;
  },
  async lowStock(tenantId, threshold, limit) {
    const rows = await db.productVariant.findMany({
      where: { tenantId, isActive: true, stock: { lte: threshold }, product: { deletedAt: null, isActive: true } },
      include: { product: { select: { name: true } } },
      orderBy: [{ stock: 'asc' }, { sku: 'asc' }],
      take: limit,
    });
    return rows.map((r) => ({ ...mapVariant(r), productName: r.product.name }));
  },
});

export const imageRepository = (db: Db): ImageRepository => ({
  async listForProduct(tenantId, productId) {
    const rows = await db.productImage.findMany({ where: { tenantId, productId }, orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }] });
    return rows.map(mapImage);
  },
  async findById(tenantId, productId, id) {
    const row = await db.productImage.findFirst({ where: { tenantId, productId, id } });
    return row && mapImage(row);
  },
  async create(tenantId, data) {
    return mapImage(await db.productImage.create({ data: { ...data, tenantId } }));
  },
  async update(tenantId, productId, id, data) {
    const { count } = await db.productImage.updateMany({ where: { tenantId, productId, id }, data });
    if (!count) return null;
    return mapImage(await db.productImage.findFirstOrThrow({ where: { tenantId, id } }));
  },
  async setPrimary(tenantId, productId, id) {
    await db.productImage.updateMany({ where: { tenantId, productId, isPrimary: true, id: { not: id } }, data: { isPrimary: false } });
    await db.productImage.updateMany({ where: { tenantId, productId, id }, data: { isPrimary: true } });
  },
  async delete(tenantId, productId, id) {
    const { count } = await db.productImage.deleteMany({ where: { tenantId, productId, id } });
    return count > 0;
  },
});

export const stockMovementRepository = (db: Db): StockMovementRepository => ({
  async create(tenantId, data) {
    await db.stockMovement.create({ data: { ...data, tenantId } });
  },
  async list(tenantId, filter, page) {
    const where: Prisma.StockMovementWhereInput = {
      tenantId,
      ...(filter.variantId ? { variantId: filter.variantId } : {}),
      ...(filter.orderId ? { orderId: filter.orderId } : {}),
    };
    const [rows, total] = await Promise.all([
      db.stockMovement.findMany({ where, include: { variant: { select: { sku: true } } }, orderBy: { createdAt: 'desc' }, ...skipTake(page) }),
      db.stockMovement.count({ where }),
    ]);
    return {
      items: rows.map(({ variant, tenantId: _t, ...m }) => ({ ...m, sku: variant.sku })),
      total,
    };
  },
});

export const catalogRepository = (db: Db): CatalogRepository => ({
  async list(tenantId) {
    const rows = await db.catalog.findMany({ where: { tenantId }, include: catalogInclude, orderBy: { createdAt: 'desc' } });
    return rows.map(mapCatalog);
  },
  async findById(tenantId, id) {
    const row = await db.catalog.findFirst({ where: { tenantId, id }, include: catalogInclude });
    return row && mapCatalog(row);
  },
  async findBySlug(tenantId, slug) {
    const row = await db.catalog.findUnique({ where: { tenantId_slug: { tenantId, slug } }, include: catalogInclude });
    return row && mapCatalog(row);
  },
  async create(tenantId, data) {
    return mapCatalog(await db.catalog.create({ data: { ...data, tenantId }, include: catalogInclude }));
  },
  async update(tenantId, id, data) {
    const { count } = await db.catalog.updateMany({ where: { tenantId, id }, data });
    if (!count) return null;
    return mapCatalog(await db.catalog.findFirstOrThrow({ where: { tenantId, id }, include: catalogInclude }));
  },
  async setProducts(tenantId, catalogId, productIds) {
    await db.catalogProduct.deleteMany({ where: { tenantId, catalogId } });
    if (productIds.length) {
      await db.catalogProduct.createMany({ data: productIds.map((productId, position) => ({ tenantId, catalogId, productId, position })) });
    }
  },
  async addProduct(tenantId, catalogId, productId) {
    const last = await db.catalogProduct.aggregate({ where: { tenantId, catalogId }, _max: { position: true } });
    await db.catalogProduct.upsert({
      where: { catalogId_productId: { catalogId, productId } },
      create: { tenantId, catalogId, productId, position: (last._max.position ?? -1) + 1 },
      update: {},
    });
  },
  async removeProduct(tenantId, catalogId, productId) {
    await db.catalogProduct.deleteMany({ where: { tenantId, catalogId, productId } });
  },
});

const linkInclude = { catalog: { include: catalogInclude } } satisfies Prisma.CatalogLinkInclude;

function mapLink(l: Prisma.CatalogLinkGetPayload<{ include: typeof linkInclude }>) {
  return {
    id: l.id,
    tenantId: l.tenantId,
    catalogId: l.catalogId,
    token: l.token,
    label: l.label,
    expiresAt: l.expiresAt,
    maxUses: l.maxUses,
    useCount: l.useCount,
    isActive: l.isActive,
    createdAt: l.createdAt,
    catalog: mapCatalog(l.catalog),
  };
}

export const catalogLinkRepository = (db: Db): CatalogLinkRepository => ({
  async list(tenantId, catalogId) {
    const rows = await db.catalogLink.findMany({ where: { tenantId, ...(catalogId ? { catalogId } : {}) }, include: linkInclude, orderBy: { createdAt: 'desc' } });
    return rows.map(mapLink);
  },
  async findById(tenantId, id) {
    const row = await db.catalogLink.findFirst({ where: { tenantId, id }, include: linkInclude });
    return row && mapLink(row);
  },
  async findByToken(token) {
    const row = await db.catalogLink.findUnique({ where: { token }, include: linkInclude });
    return row && mapLink(row);
  },
  async create(tenantId, data) {
    return mapLink(await db.catalogLink.create({ data: { ...data, tenantId }, include: linkInclude }));
  },
  async update(tenantId, id, data) {
    const { count } = await db.catalogLink.updateMany({ where: { tenantId, id }, data });
    if (!count) return null;
    return mapLink(await db.catalogLink.findFirstOrThrow({ where: { tenantId, id }, include: linkInclude }));
  },
  async consumeUse(tenantId, id) {
    const rows = await db.$queryRaw<{ id: string }[]>`
      UPDATE "CatalogLink" SET "useCount" = "useCount" + 1, "updatedAt" = now()
       WHERE "id" = ${id}::uuid AND "tenantId" = ${tenantId}::uuid
         AND ("maxUses" IS NULL OR "useCount" < "maxUses")
   RETURNING "id"`;
    return rows.length === 1;
  },
});
