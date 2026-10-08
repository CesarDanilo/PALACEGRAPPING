import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addMember, asStore, asTenant, createHarness, createProduct, hasDatabase, placeOrder, resetDatabase, seedStore, type Harness, type SeededStore } from '../support/harness.js';

describe.skipIf(!hasDatabase)('autenticação', () => {
  let h: Harness;
  beforeAll(() => {
    h = createHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await resetDatabase();
    await seedStore(h, 'loja-a');
  });

  const login = () => h.api.post('/api/v1/auth/login').send({ email: 'owner@loja-a.test', password: 'owner-password-123' });
  const cookieOf = (res: { headers: Record<string, unknown> }) => String((res.headers['set-cookie'] as string[])[0]).split(';')[0]!;

  it('faz login, devolve perfil e grava refresh token httpOnly', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.memberships[0].role).toBe('OWNER');
    expect(String(res.headers['set-cookie'])).toMatch(/rt=.+HttpOnly/i);
  });

  it('rejeita senha errada com mensagem genérica', async () => {
    const res = await h.api.post('/api/v1/auth/login').send({ email: 'owner@loja-a.test', password: 'errada' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('E-mail ou senha inválidos');
  });

  it('rotaciona o refresh token e revoga a família quando um token antigo é reutilizado', async () => {
    const first = cookieOf(await login());
    const refreshed = await h.api.post('/api/v1/auth/refresh').set('Cookie', first);
    expect(refreshed.status).toBe(200);
    const second = cookieOf(refreshed);
    expect(second).not.toBe(first);

    const reuse = await h.api.post('/api/v1/auth/refresh').set('Cookie', first);
    expect(reuse.status).toBe(401);
    // A família inteira foi revogada: o token novo também deixa de valer.
    expect((await h.api.post('/api/v1/auth/refresh').set('Cookie', second)).status).toBe(401);
  });

  it('logout revoga a sessão', async () => {
    const cookie = cookieOf(await login());
    expect((await h.api.post('/api/v1/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await h.api.post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('protege rotas administrativas', async () => {
    expect((await h.api.get('/api/v1/products')).status).toBe(401);
    expect((await h.api.get('/api/v1/products').set('Authorization', 'Bearer inválido')).status).toBe(401);
  });
});

describe.skipIf(!hasDatabase)('isolamento entre lojas e papéis', () => {
  let h: Harness;
  let a: SeededStore;
  let b: SeededStore;
  let productA: { productId: string; variantId: string };

  beforeAll(() => {
    h = createHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await resetDatabase();
    a = await seedStore(h, 'loja-a');
    b = await seedStore(h, 'loja-b');
    productA = await createProduct(h, a, { slug: 'kimono-a', price: 50000, stock: 5 });
  });

  it('não aceita X-Tenant-Id de uma loja da qual o usuário não é membro', async () => {
    const res = await h.api.get('/api/v1/products').set({ Authorization: `Bearer ${b.ownerToken}`, 'X-Tenant-Id': a.tenantId });
    expect(res.status).toBe(403);
  });

  it('uma loja não lê nem altera produtos de outra', async () => {
    const list = await h.api.get('/api/v1/products').set(asTenant(b));
    expect(list.body.items).toHaveLength(0);
    expect((await h.api.get(`/api/v1/products/${productA.productId}`).set(asTenant(b))).status).toBe(404);
    expect((await h.api.patch(`/api/v1/products/${productA.productId}`).set(asTenant(b)).send({ name: 'Invadido' })).status).toBe(404);
    expect((await h.api.delete(`/api/v1/products/${productA.productId}`).set(asTenant(b))).status).toBe(404);
    const movement = await h.api.post(`/api/v1/inventory/variants/${productA.variantId}/movements`).set(asTenant(b)).send({ type: 'OUTBOUND', quantity: 1, reason: 'teste' });
    expect(movement.status).toBe(404);
    const own = await h.api.get(`/api/v1/products/${productA.productId}`).set(asTenant(a));
    expect(own.body.name).toBe('Produto kimono-a');
    expect(own.body.variants[0].stock).toBe(5);
  });

  it('a vitrine de uma loja não expõe nem vende produtos de outra', async () => {
    expect((await h.api.get('/api/v1/public/products').set(asStore(b))).body.items).toHaveLength(0);
    expect((await h.api.get('/api/v1/public/products/kimono-a').set(asStore(b))).status).toBe(404);
    const res = await placeOrder(h, b, [{ variantId: productA.variantId, quantity: 1 }]);
    expect(res.status).toBe(400);
    expect(res.body.error.details.lines[0].problem).toBe('NOT_FOUND');
  });

  it('pedidos, clientes e financeiro também são isolados', async () => {
    const order = await placeOrder(h, a, [{ variantId: productA.variantId, quantity: 1 }]);
    expect(order.status).toBe(201);
    expect((await h.api.get('/api/v1/orders').set(asTenant(b))).body.items).toHaveLength(0);
    expect((await h.api.get('/api/v1/customers').set(asTenant(b))).body.items).toHaveLength(0);
    const ordersA = await h.api.get('/api/v1/orders').set(asTenant(a));
    expect(ordersA.body.items).toHaveLength(1);
    expect((await h.api.get(`/api/v1/orders/${ordersA.body.items[0].id}`).set(asTenant(b))).status).toBe(404);
    const summaryB = await h.api.get('/api/v1/finance/summary').set(asTenant(b));
    expect(summaryB.body.ordersCreated.count).toBe(0);
  });

  it('operador gerencia pedidos e estoque, mas não catálogo nem financeiro', async () => {
    const op = await addMember(h, a, 'OPERATOR');
    const headers = asTenant(a, op.token);
    expect((await h.api.get('/api/v1/products').set(headers)).status).toBe(200);
    expect((await h.api.post('/api/v1/products').set(headers).send({ name: 'Produto X', price: 100 })).status).toBe(403);
    expect((await h.api.get('/api/v1/finance/summary').set(headers)).status).toBe(403);
    expect((await h.api.post(`/api/v1/inventory/variants/${productA.variantId}/movements`).set(headers).send({ type: 'INBOUND', quantity: 2, reason: 'Recebimento' })).status).toBe(201);
    expect((await h.api.get('/api/v1/tenants/current/members').set(headers)).status).toBe(403);
    const dashboard = await h.api.get('/api/v1/dashboard').set(headers);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.finance).toBeNull();
  });

  it('administrador não pode promover ninguém a proprietário; a loja mantém ao menos um OWNER', async () => {
    const admin = await addMember(h, a, 'ADMIN');
    const res = await h.api.post('/api/v1/tenants/current/members').set(asTenant(a, admin.token)).send({ email: 'novo@loja-a.test', role: 'OWNER', name: 'Novo dono', password: 'senha-forte-123' });
    expect(res.status).toBe(403);
    const demote = await h.api.patch(`/api/v1/tenants/current/members/${a.ownerId}`).set(asTenant(a)).send({ role: 'ADMIN' });
    expect(demote.status).toBe(409);
  });

  it('somente administradores da plataforma criam lojas', async () => {
    const res = await h.api.post('/api/v1/tenants').set('Authorization', `Bearer ${a.ownerToken}`).send({ slug: 'nova', name: 'Nova loja' });
    expect(res.status).toBe(403);
  });
});
