import type { RequestHandler, Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Container } from '../../../container.js';
import { slugify } from '../../../domain/products/product-rules.js';
import { AppError } from '../../../shared/errors.js';
import { paginationQuery } from '../../../shared/pagination.js';
import { ctxOf } from '../middlewares.js';
import { boolQuery, centsSchema, idParams, isoDate, route, slugSchema, type Access } from '../route-kit.js';
import { adminLink } from '../serializers.js';

const variantBody = z.object({
  sku: z.string().trim().min(1).max(64),
  size: z.string().trim().max(20).nullable().default(null),
  color: z.string().trim().max(40).nullable().default(null),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  price: centsSchema.nullable().default(null),
  salePrice: centsSchema.nullable().default(null),
  isActive: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
});

const productBody = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugSchema.optional(),
  description: z.string().max(10_000).default(''),
  categoryId: z.uuid().nullable().default(null),
  line: z.string().trim().max(40).nullable().default(null),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(30).default([]),
  price: centsSchema,
  salePrice: centsSchema.nullable().default(null),
  sizeGuide: z.string().max(10_000).nullable().default(null),
  shippingInfo: z.string().max(2_000).nullable().default(null),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  releasedAt: isoDate.nullable().default(null),
});

const productPatch = z
  .object({
    name: z.string().trim().min(2).max(160),
    slug: slugSchema,
    description: z.string().max(10_000),
    categoryId: z.uuid().nullable(),
    line: z.string().trim().max(40).nullable(),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(30),
    price: centsSchema,
    salePrice: centsSchema.nullable(),
    sizeGuide: z.string().max(10_000).nullable(),
    shippingInfo: z.string().max(2_000).nullable(),
    isActive: z.boolean(),
    isFeatured: z.boolean(),
    releasedAt: isoDate.nullable(),
  })
  .partial();

export const productListQuery = paginationQuery.extend({
  search: z.string().trim().max(100).optional(),
  line: z.string().trim().max(40).optional(),
  size: z.string().trim().max(20).optional(),
  color: z.string().trim().max(40).optional(),
  inStock: boolQuery.optional(),
  featured: boolQuery.optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'newest']).default('relevance'),
});

const catalogBody = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  description: z.string().max(5_000).default(''),
  type: z.enum(['GENERAL', 'COLLECTION', 'CAMPAIGN']).default('COLLECTION'),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
  heroImageUrl: z.url().nullable().default(null),
  startsAt: isoDate.nullable().default(null),
  endsAt: isoDate.nullable().default(null),
  productIds: z.array(z.uuid()).max(500).default([]),
});

export function registerCatalogRoutes(router: Router, guards: Record<Access, RequestHandler[]>, c: Container) {
  const { categories, products, inventory, catalogs } = c.services;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: c.env.UPLOAD_MAX_BYTES, files: 1 } });

  // ── Categorias ──
  route(router, guards, { method: 'get', path: '/categories', tag: 'Categorias', summary: 'Lista categorias.', access: 'tenant' },
    async ({ req }) => ({ items: await categories.list(ctxOf(req)) }));

  const categoryBody = z.object({
    name: z.string().trim().min(2).max(80),
    slug: slugSchema,
    description: z.string().max(2_000).nullable().default(null),
    parentId: z.uuid().nullable().default(null),
    position: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
  });
  route(router, guards, { method: 'post', path: '/categories', tag: 'Categorias', summary: 'Cria categoria.', access: 'tenant', status: 201, body: categoryBody },
    async ({ body, req }) => categories.create(ctxOf(req), body));
  route(router, guards, {
    method: 'patch', path: '/categories/{id}', tag: 'Categorias', summary: 'Atualiza categoria.', access: 'tenant', params: idParams,
    // Sem .default(): em PATCH, campos ausentes não podem ser reescritos.
    body: z.object({
      name: z.string().trim().min(2).max(80),
      slug: slugSchema,
      description: z.string().max(2_000).nullable(),
      parentId: z.uuid().nullable(),
      position: z.number().int().min(0),
      isActive: z.boolean(),
    }).partial(),
  }, async ({ params, body, req }) => categories.update(ctxOf(req), params.id, body));

  // ── Produtos ──
  route(router, guards, {
    method: 'get', path: '/products', tag: 'Produtos', summary: 'Lista produtos (inclui inativos).', access: 'tenant',
    query: productListQuery.extend({ categoryId: z.uuid().optional() }),
  }, async ({ query, req }) => {
    const { page, pageSize, ...filter } = query;
    return products.list(ctxOf(req), filter, { page, pageSize });
  });

  route(router, guards, {
    method: 'post', path: '/products', tag: 'Produtos', summary: 'Cria produto com variantes e estoque inicial.', access: 'tenant', status: 201,
    body: productBody.extend({ variants: z.array(variantBody.extend({ stock: z.number().int().min(0).default(0) })).max(200).default([]) }),
  }, async ({ body, req }) => {
    const { variants, slug, ...data } = body;
    return products.create(ctxOf(req), { ...data, slug: slug ?? slugify(data.name) }, variants);
  });

  route(router, guards, { method: 'get', path: '/products/{id}', tag: 'Produtos', summary: 'Detalhe do produto.', access: 'tenant', params: idParams },
    async ({ params, req }) => products.get(ctxOf(req), params.id));

  route(router, guards, { method: 'patch', path: '/products/{id}', tag: 'Produtos', summary: 'Atualiza produto.', access: 'tenant', params: idParams, body: productPatch },
    async ({ params, body, req }) => products.update(ctxOf(req), params.id, body));

  route(router, guards, { method: 'delete', path: '/products/{id}', tag: 'Produtos', summary: 'Desativação lógica do produto.', access: 'tenant', params: idParams },
    async ({ params, req }) => {
      await products.remove(ctxOf(req), params.id);
      return undefined;
    });

  route(router, guards, {
    method: 'post', path: '/products/{id}/variants', tag: 'Produtos', summary: 'Adiciona variante.', access: 'tenant', status: 201, params: idParams,
    body: variantBody.extend({ stock: z.number().int().min(0).default(0) }),
  }, async ({ params, body, req }) => products.addVariant(ctxOf(req), params.id, body));

  route(router, guards, {
    method: 'patch', path: '/products/{id}/variants/{variantId}', tag: 'Produtos', summary: 'Atualiza variante (estoque muda só por movimentação).', access: 'tenant',
    params: z.object({ id: z.uuid(), variantId: z.uuid() }),
    body: z.object({
      sku: z.string().trim().min(1).max(64),
      size: z.string().trim().max(20).nullable(),
      color: z.string().trim().max(40).nullable(),
      colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
      price: centsSchema.nullable(),
      salePrice: centsSchema.nullable(),
      isActive: z.boolean(),
      position: z.number().int().min(0),
    }).partial(),
  }, async ({ params, body, req }) => products.updateVariant(ctxOf(req), params.id, params.variantId, body));

  route(router, guards, {
    method: 'post', path: '/products/{id}/images', tag: 'Produtos', summary: 'Envia imagem (multipart: file, alt, variantId).', access: 'tenant', status: 201,
    params: idParams, before: [upload.single('file')],
  }, async ({ params, req }) => {
    const file = req.file;
    if (!file) throw new AppError('VALIDATION_ERROR', 'Envie o arquivo no campo "file"');
    const fields = z.object({ alt: z.string().max(200).default(''), variantId: z.uuid().optional() }).parse(req.body ?? {});
    return products.addImage(ctxOf(req), params.id, {
      buffer: file.buffer,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      alt: fields.alt,
      variantId: fields.variantId ?? null,
    });
  });

  route(router, guards, {
    method: 'patch', path: '/products/{id}/images/{imageId}', tag: 'Produtos', summary: 'Atualiza texto alternativo, ordem ou imagem principal.', access: 'tenant',
    params: z.object({ id: z.uuid(), imageId: z.uuid() }),
    body: z.object({ alt: z.string().max(200), position: z.number().int().min(0), isPrimary: z.literal(true), variantId: z.uuid().nullable() }).partial(),
  }, async ({ params, body, req }) => products.updateImage(ctxOf(req), params.id, params.imageId, body));

  route(router, guards, {
    method: 'delete', path: '/products/{id}/images/{imageId}', tag: 'Produtos', summary: 'Remove imagem (Storage e metadados).', access: 'tenant',
    params: z.object({ id: z.uuid(), imageId: z.uuid() }),
  }, async ({ params, req }) => {
    await products.removeImage(ctxOf(req), params.id, params.imageId);
    return undefined;
  });

  // ── Estoque ──
  route(router, guards, {
    method: 'post', path: '/inventory/variants/{variantId}/movements', tag: 'Estoque', summary: 'Registra entrada, saída ou ajuste de inventário.', access: 'tenant', status: 201,
    params: z.object({ variantId: z.uuid() }),
    body: z.discriminatedUnion('type', [
      z.object({ type: z.literal('INBOUND'), quantity: z.number().int().positive().max(100_000), reason: z.string().trim().min(2).max(200) }),
      z.object({ type: z.literal('OUTBOUND'), quantity: z.number().int().positive().max(100_000), reason: z.string().trim().min(2).max(200) }),
      z.object({ type: z.literal('ADJUSTMENT'), countedStock: z.number().int().min(0).max(1_000_000), reason: z.string().trim().min(2).max(200) }),
    ]),
  }, async ({ params, body, req }) => inventory.move(ctxOf(req), params.variantId, body));

  route(router, guards, {
    method: 'get', path: '/inventory/movements', tag: 'Estoque', summary: 'Histórico de movimentações.', access: 'tenant',
    query: paginationQuery.extend({ variantId: z.uuid().optional(), orderId: z.uuid().optional() }),
  }, async ({ query, req }) => {
    const { page, pageSize, ...filter } = query;
    return inventory.movements(ctxOf(req), filter, { page, pageSize });
  });

  route(router, guards, { method: 'get', path: '/inventory/low-stock', tag: 'Estoque', summary: 'Variantes com estoque baixo.', access: 'tenant' },
    async ({ req }) => ({ items: await inventory.lowStock(ctxOf(req)) }));

  // ── Catálogos ──
  route(router, guards, { method: 'get', path: '/catalogs', tag: 'Catálogos', summary: 'Lista catálogos.', access: 'tenant' },
    async ({ req }) => ({ items: await catalogs.list(ctxOf(req)) }));

  route(router, guards, { method: 'post', path: '/catalogs', tag: 'Catálogos', summary: 'Cria catálogo (geral, coleção ou campanha).', access: 'tenant', status: 201, body: catalogBody },
    async ({ body, req }) => {
      const { productIds, ...data } = body;
      return catalogs.create(ctxOf(req), data, productIds);
    });

  route(router, guards, { method: 'get', path: '/catalogs/{id}', tag: 'Catálogos', summary: 'Detalhe do catálogo.', access: 'tenant', params: idParams },
    async ({ params, req }) => catalogs.get(ctxOf(req), params.id));

  route(router, guards, {
    method: 'patch', path: '/catalogs/{id}', tag: 'Catálogos', summary: 'Atualiza catálogo.', access: 'tenant', params: idParams,
    body: z.object({
      name: z.string().trim().min(2).max(120),
      slug: slugSchema,
      description: z.string().max(5_000),
      type: z.enum(['GENERAL', 'COLLECTION', 'CAMPAIGN']),
      isPublic: z.boolean(),
      isActive: z.boolean(),
      heroImageUrl: z.url().nullable(),
      startsAt: isoDate.nullable(),
      endsAt: isoDate.nullable(),
    }).partial(),
  }, async ({ params, body, req }) => catalogs.update(ctxOf(req), params.id, body));

  route(router, guards, {
    method: 'put', path: '/catalogs/{id}/products', tag: 'Catálogos', summary: 'Define os produtos do catálogo (na ordem enviada).', access: 'tenant', params: idParams,
    body: z.object({ productIds: z.array(z.uuid()).max(500) }),
  }, async ({ params, body, req }) => catalogs.setProducts(ctxOf(req), params.id, body.productIds));

  route(router, guards, {
    method: 'post', path: '/catalogs/{id}/products/{productId}', tag: 'Catálogos', summary: 'Associa produto ao catálogo.', access: 'tenant',
    params: z.object({ id: z.uuid(), productId: z.uuid() }),
  }, async ({ params, req }) => {
    await catalogs.addProduct(ctxOf(req), params.id, params.productId);
    return undefined;
  });

  route(router, guards, {
    method: 'delete', path: '/catalogs/{id}/products/{productId}', tag: 'Catálogos', summary: 'Remove produto do catálogo.', access: 'tenant',
    params: z.object({ id: z.uuid(), productId: z.uuid() }),
  }, async ({ params, req }) => {
    await catalogs.removeProduct(ctxOf(req), params.id, params.productId);
    return undefined;
  });

  // ── Links exclusivos ──
  route(router, guards, {
    method: 'get', path: '/catalog-links', tag: 'Links exclusivos', summary: 'Lista links.', access: 'tenant',
    query: z.object({ catalogId: z.uuid().optional() }),
  }, async ({ query, req }) => ({ items: (await catalogs.listLinks(ctxOf(req), query.catalogId)).map(adminLink) }));

  route(router, guards, {
    method: 'post', path: '/catalog-links', tag: 'Links exclusivos', summary: 'Gera link exclusivo com token aleatório.', access: 'tenant', status: 201,
    body: z.object({
      catalogId: z.uuid(),
      label: z.string().trim().min(2).max(120),
      expiresAt: isoDate.nullable().default(null),
      maxUses: z.number().int().positive().max(1_000_000).nullable().default(null),
    }),
  }, async ({ body, req }) => adminLink(await catalogs.createLink(ctxOf(req), body)));

  route(router, guards, {
    method: 'patch', path: '/catalog-links/{id}', tag: 'Links exclusivos', summary: 'Ativa/desativa ou altera expiração e limite.', access: 'tenant', params: idParams,
    body: z.object({
      label: z.string().trim().min(2).max(120),
      expiresAt: isoDate.nullable(),
      maxUses: z.number().int().positive().max(1_000_000).nullable(),
      isActive: z.boolean(),
    }).partial(),
  }, async ({ params, body, req }) => adminLink(await catalogs.updateLink(ctxOf(req), params.id, body)));
}
