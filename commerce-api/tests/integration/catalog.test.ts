import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asStore, asTenant, createHarness, createProduct, hasDatabase, placeOrder, resetDatabase, seedStore, type Harness, type SeededStore } from '../support/harness.js';

describe.skipIf(!hasDatabase)('produtos', () => {
  let h: Harness;
  let a: SeededStore;
  beforeAll(() => {
    h = createHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await resetDatabase();
    a = await seedStore(h, 'loja-a');
  });

  it('valida preço, preço promocional, slug e SKU', async () => {
    const bad = await h.api.post('/api/v1/products').set(asTenant(a)).send({ name: 'Rash', price: 10000, salePrice: 10000 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/promocional/);

    const float = await h.api.post('/api/v1/products').set(asTenant(a)).send({ name: 'Rash', price: 99.9 });
    expect(float.status).toBe(400);

    await createProduct(h, a, { slug: 'rash', price: 10000, stock: 1, sku: 'RASH-M' });
    expect((await h.api.post('/api/v1/products').set(asTenant(a)).send({ name: 'Rash 2', slug: 'rash', price: 100 })).status).toBe(409);
    const dupSku = await h.api.post('/api/v1/products').set(asTenant(a)).send({ name: 'Outro', price: 100, variants: [{ sku: 'RASH-M' }] });
    expect(dupSku.status).toBe(409);
  });

  it('registra estoque inicial e movimentações; nunca deixa saldo negativo', async () => {
    const { variantId } = await createProduct(h, a, { slug: 'shorts', price: 15000, stock: 3 });
    const out = await h.api.post(`/api/v1/inventory/variants/${variantId}/movements`).set(asTenant(a)).send({ type: 'OUTBOUND', quantity: 5, reason: 'Avaria' });
    expect(out.status).toBe(409);
    expect(out.body.error.code).toBe('INSUFFICIENT_STOCK');
    const adj = await h.api.post(`/api/v1/inventory/variants/${variantId}/movements`).set(asTenant(a)).send({ type: 'ADJUSTMENT', countedStock: 7, reason: 'Inventário' });
    expect(adj.body).toEqual({ balance: 7, delta: 4 });
    const history = await h.api.get('/api/v1/inventory/movements').set(asTenant(a)).query({ variantId });
    expect(history.body.items.map((m: { type: string; quantity: number }) => [m.type, m.quantity])).toEqual([
      ['ADJUSTMENT', 4],
      ['INBOUND', 3],
    ]);
  });

  it('desativação lógica tira o produto da vitrine e da administração', async () => {
    const { productId } = await createProduct(h, a, { slug: 'faixa', price: 5000, stock: 2 });
    expect((await h.api.get('/api/v1/public/products/faixa').set(asStore(a))).status).toBe(200);
    expect((await h.api.delete(`/api/v1/products/${productId}`).set(asTenant(a))).status).toBe(204);
    expect((await h.api.get('/api/v1/public/products/faixa').set(asStore(a))).status).toBe(404);
    expect((await h.api.get(`/api/v1/products/${productId}`).set(asTenant(a))).status).toBe(404);
  });

  it('vitrine filtra, ordena e não expõe estoque exato', async () => {
    await createProduct(h, a, { slug: 'barato', price: 1000, stock: 10 });
    await createProduct(h, a, { slug: 'caro', price: 9000, stock: 0 });
    await createProduct(h, a, { slug: 'inativo', price: 5000, stock: 5, isActive: false });
    const all = await h.api.get('/api/v1/public/products').set(asStore(a)).query({ sort: 'price_desc' });
    expect(all.body.items.map((p: { slug: string }) => p.slug)).toEqual(['caro', 'barato']);
    expect(all.body.items[0].availability).toBe('out');
    expect(all.body.items[0].variants[0]).not.toHaveProperty('stock');
    const inStock = await h.api.get('/api/v1/public/products').set(asStore(a)).query({ inStock: 'true' });
    expect(inStock.body.items.map((p: { slug: string }) => p.slug)).toEqual(['barato']);
  });

  it('upload valida tipo real do arquivo e organiza o caminho por loja e produto', async () => {
    const { productId } = await createProduct(h, a, { slug: 'foto', price: 1000, stock: 1 });
    const fake = await h.api.post(`/api/v1/products/${productId}/images`).set(asTenant(a)).attach('file', Buffer.from('<svg></svg>'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(415);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const ok = await h.api.post(`/api/v1/products/${productId}/images`).set(asTenant(a)).field('alt', 'Frente').attach('file', png, { filename: 'x.png', contentType: 'image/png' });
    expect(ok.status).toBe(201);
    expect(ok.body.isPrimary).toBe(true);
    expect(ok.body.storagePath).toMatch(new RegExp(`^${a.tenantId}/products/${productId}/.+\\.png$`));
    expect(h.storage.objects.has(ok.body.storagePath)).toBe(true);
    expect((await h.api.delete(`/api/v1/products/${productId}/images/${ok.body.id}`).set(asTenant(a))).status).toBe(204);
    expect(h.storage.objects.size).toBe(0);
  });
});

describe.skipIf(!hasDatabase)('catálogos e links exclusivos', () => {
  let h: Harness;
  let a: SeededStore;
  let p1: { productId: string; variantId: string };
  let p2: { productId: string; variantId: string };
  beforeAll(() => {
    h = createHarness();
  });
  afterAll(() => {
    h.clock.reset();
    return h.close();
  });
  beforeEach(async () => {
    h.clock.reset();
    await resetDatabase();
    a = await seedStore(h, 'loja-a');
    p1 = await createProduct(h, a, { slug: 'p1', price: 1000, stock: 10 });
    p2 = await createProduct(h, a, { slug: 'p2', price: 2000, stock: 10 });
  });

  const createCatalog = (body: Record<string, unknown>) => h.api.post('/api/v1/catalogs').set(asTenant(a)).send({ name: 'Campanha', slug: 'campanha', ...body });

  it('catálogo público por slug mostra só os produtos associados', async () => {
    const res = await createCatalog({ productIds: [p2.productId] });
    expect(res.status).toBe(201);
    const pub = await h.api.get('/api/v1/public/catalogs/campanha').set(asStore(a));
    expect(pub.status).toBe(200);
    expect(pub.body.catalog).not.toHaveProperty('id');
    expect(pub.body.products.items.map((p: { slug: string }) => p.slug)).toEqual(['p2']);
  });

  it('catálogo privado não abre por slug, apenas por link', async () => {
    const catalog = await createCatalog({ isPublic: false, productIds: [p1.productId] });
    expect((await h.api.get('/api/v1/public/catalogs/campanha').set(asStore(a))).status).toBe(404);
    const link = await h.api.post('/api/v1/catalog-links').set(asTenant(a)).send({ catalogId: catalog.body.id, label: 'VIP' });
    expect(link.status).toBe(201);
    expect(link.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const open = await h.api.get(`/api/v1/public/catalog-links/${link.body.token}`);
    expect(open.status).toBe(200);
    expect(open.body.store.slug).toBe('loja-a');
    expect(open.body.products.items).toHaveLength(1);
    // O token não serve como credencial administrativa.
    expect((await h.api.get('/api/v1/products').set('Authorization', `Bearer ${link.body.token}`)).status).toBe(401);
  });

  it('link expirado ou desativado responde 410', async () => {
    const catalog = await createCatalog({ productIds: [p1.productId] });
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const link = await h.api.post('/api/v1/catalog-links').set(asTenant(a)).send({ catalogId: catalog.body.id, label: 'Curto', expiresAt });
    expect((await h.api.get(`/api/v1/public/catalog-links/${link.body.token}`)).status).toBe(200);

    h.clock.set(new Date(Date.now() + 120_000));
    const expired = await h.api.get(`/api/v1/public/catalog-links/${link.body.token}`);
    expect(expired.status).toBe(410);
    expect(expired.body.error.details.reason).toBe('EXPIRED');
    h.clock.reset();

    const other = await h.api.post('/api/v1/catalog-links').set(asTenant(a)).send({ catalogId: catalog.body.id, label: 'Off' });
    await h.api.patch(`/api/v1/catalog-links/${other.body.id}`).set(asTenant(a)).send({ isActive: false });
    expect((await h.api.get(`/api/v1/public/catalog-links/${other.body.token}`)).status).toBe(410);
  });

  it('limite de utilização conta pedidos e restringe a compra aos produtos do catálogo', async () => {
    const catalog = await createCatalog({ isPublic: false, productIds: [p1.productId] });
    const link = await h.api.post('/api/v1/catalog-links').set(asTenant(a)).send({ catalogId: catalog.body.id, label: 'Um uso', maxUses: 1 });
    const context = { context: { kind: 'link', token: link.body.token } };

    const outside = await placeOrder(h, a, [{ variantId: p2.variantId, quantity: 1 }], context);
    expect(outside.status).toBe(400);
    expect(outside.body.error.details.lines[0].problem).toBe('NOT_IN_CATALOG');

    const first = await placeOrder(h, a, [{ variantId: p1.variantId, quantity: 1 }], context);
    expect(first.status).toBe(201);
    const orders = await h.api.get('/api/v1/orders').set(asTenant(a));
    expect(orders.body.items[0].source).toBe('CATALOG_LINK');

    const second = await placeOrder(h, a, [{ variantId: p1.variantId, quantity: 1 }], context);
    expect(second.status).toBe(410);
    expect((await h.api.get(`/api/v1/public/catalog-links/${link.body.token}`)).status).toBe(410);
  });
});
