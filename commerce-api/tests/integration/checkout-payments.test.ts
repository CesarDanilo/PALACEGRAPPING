import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asStore, asTenant, createHarness, createProduct, hasDatabase, placeOrder, resetDatabase, seedStore, stockOf, type Harness, type SeededStore } from '../support/harness.js';

describe.skipIf(!hasDatabase)('checkout', () => {
  let h: Harness;
  let a: SeededStore;
  let item: { productId: string; variantId: string };
  beforeAll(() => {
    h = createHarness();
  });
  afterAll(() => {
    h.clock.reset();
    return h.close();
  });
  beforeEach(async () => {
    h.clock.reset();
    h.payments.checkouts = [];
    await resetDatabase();
    a = await seedStore(h, 'loja-a', { flatRate: 2990, freeAbove: 100000 });
    item = await createProduct(h, a, { slug: 'kimono', price: 50000, salePrice: 45000, stock: 3 });
  });

  it('recalcula preços e frete no servidor, ignorando valores enviados pelo navegador', async () => {
    const quote = await h.api
      .post('/api/v1/checkout/quote')
      .set(asStore(a))
      .send({ items: [{ variantId: item.variantId, quantity: 2, unitPrice: 1 }], zipCode: '01310-100' });
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({ subtotal: 90000, shipping: 2990, total: 92990, valid: true });
    expect(quote.body.lines[0].unitPrice).toBe(45000);

    const order = await placeOrder(h, a, [{ variantId: item.variantId, quantity: 2 }], { subtotal: 1, total: 1 });
    expect(order.status).toBe(201);
    expect(order.body.order.total).toBe(92990);
    expect(order.body.order.items[0]).toMatchObject({ unitPrice: 45000, quantity: 2, lineTotal: 90000 });
  });

  it('recusa o pedido quando o total visto pelo comprador mudou', async () => {
    await h.api.patch(`/api/v1/products/${item.productId}`).set(asTenant(a)).send({ salePrice: 40000 });
    const res = await placeOrder(h, a, [{ variantId: item.variantId, quantity: 1 }], { expectedTotal: 47990 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRICE_CHANGED');
    expect(await stockOf(h, a.tenantId, item.variantId)).toBe(3);
  });

  it('recusa estoque insuficiente sem baixar nada', async () => {
    const res = await placeOrder(h, a, [{ variantId: item.variantId, quantity: 4 }]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(h, a.tenantId, item.variantId)).toBe(3);
  });

  it('compras concorrentes nunca vendem além do estoque', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => placeOrder(h, a, [{ variantId: item.variantId, quantity: 1 }])));
    const created = results.filter((r) => r.status === 201);
    const refused = results.filter((r) => r.status === 409);
    expect(created).toHaveLength(3);
    expect(refused).toHaveLength(5);
    expect(await stockOf(h, a.tenantId, item.variantId)).toBe(0);
    const movements = await h.api.get('/api/v1/inventory/movements').set(asTenant(a)).query({ variantId: item.variantId });
    expect(movements.body.items.filter((m: { type: string }) => m.type === 'SALE')).toHaveLength(3);
  });

  it('é idempotente: a mesma chave devolve o mesmo pedido e baixa o estoque uma vez', async () => {
    const key = randomUUID();
    const [first, second] = await Promise.all([
      placeOrder(h, a, [{ variantId: item.variantId, quantity: 1 }], {}, key),
      placeOrder(h, a, [{ variantId: item.variantId, quantity: 1 }], {}, key),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body.order.number).toBe(second.body.order.number);
    expect(first.body.trackingToken).toBe(second.body.trackingToken);
    const third = await placeOrder(h, a, [{ variantId: item.variantId, quantity: 1 }], {}, key);
    expect(third.body.replayed).toBe(true);
    expect(await stockOf(h, a.tenantId, item.variantId)).toBe(2);
    expect((await h.api.get('/api/v1/orders').set(asTenant(a))).body.total).toBe(1);
  });

  it('acompanhamento público exige o token do pedido', async () => {
    const order = await placeOrder(h, a, [{ variantId: item.variantId, quantity: 1 }]);
    const number = order.body.order.number;
    expect((await h.api.get(`/api/v1/public/orders/${number}`).set(asStore(a))).status).toBe(404);
    expect((await h.api.get(`/api/v1/public/orders/${number}`).set(asStore(a)).set('X-Order-Token', 'x'.repeat(64))).status).toBe(404);
    const ok = await h.api.get(`/api/v1/public/orders/${number}`).set(asStore(a)).set('X-Order-Token', order.body.trackingToken);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('PENDING_PAYMENT');
    expect(ok.body).not.toHaveProperty('customerPhone');
    expect(ok.body.payment.checkoutUrl).toMatch(/^https:\/\/pay\.example\.test\//);
  });

  it('cancelamento devolve o estoque com movimentação registrada', async () => {
    const order = await placeOrder(h, a, [{ variantId: item.variantId, quantity: 2 }]);
    const { body } = await h.api.get('/api/v1/orders').set(asTenant(a));
    const id = body.items[0].id;
    expect(await stockOf(h, a.tenantId, item.variantId)).toBe(1);
    const cancel = await h.api.patch(`/api/v1/orders/${id}/status`).set(asTenant(a)).send({ status: 'CANCELLED', note: 'Desistência' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.order.status).toBe('CANCELLED');
    expect(await stockOf(h, a.tenantId, item.variantId)).toBe(3);
    const movements = await h.api.get('/api/v1/inventory/movements').set(asTenant(a)).query({ orderId: id });
    expect(movements.body.items.map((m: { type: string; quantity: number }) => [m.type, m.quantity])).toEqual([
      ['RELEASE', 2],
      ['SALE', -2],
    ]);
    // Cancelar de novo não devolve estoque duas vezes.
    expect((await h.api.patch(`/api/v1/orders/${id}/status`).set(asTenant(a)).send({ status: 'CANCELLED' })).status).toBe(409);
    expect(await stockOf(h, a.tenantId, item.variantId)).toBe(3);
    expect(order.status).toBe(201);
  });

  it('PAID não pode ser definido manualmente', async () => {
    await placeOrder(h, a, [{ variantId: item.variantId, quantity: 1 }]);
    const { body } = await h.api.get('/api/v1/orders').set(asTenant(a));
    const res = await h.api.patch(`/api/v1/orders/${body.items[0].id}/status`).set(asTenant(a)).send({ status: 'PAID' });
    expect(res.status).toBe(400);
  });

  it('pedidos vencidos expiram e devolvem o estoque', async () => {
    await placeOrder(h, a, [{ variantId: item.variantId, quantity: 3 }]);
    expect(await stockOf(h, a.tenantId, item.variantId)).toBe(0);
    expect(await h.container.services.orders.expireOverdue()).toBe(0);
    h.clock.set(new Date(Date.now() + 61 * 60_000));
    expect(await h.container.services.orders.expireOverdue()).toBe(1);
    expect(await h.container.services.orders.expireOverdue()).toBe(0);
    expect(await stockOf(h, a.tenantId, item.variantId)).toBe(3);
    h.clock.reset(); // o access token do teste foi emitido no "presente"
    const { body } = await h.api.get('/api/v1/orders').set(asTenant(a));
    expect(body.items[0].status).toBe('EXPIRED');
  });
});

describe.skipIf(!hasDatabase)('pagamentos e financeiro', () => {
  let h: Harness;
  let a: SeededStore;
  let item: { productId: string; variantId: string };
  beforeAll(() => {
    h = createHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    h.payments.checkouts = [];
    h.payments.remote.clear();
    await resetDatabase();
    a = await seedStore(h, 'loja-a', { flatRate: 1000 });
    item = await createProduct(h, a, { slug: 'rash', price: 20000, stock: 5 });
  });

  const webhook = (eventId: string, paymentId: string, signature = h.payments.secret) =>
    h.api.post('/api/v1/webhooks/payments/fakepay').set('X-Fake-Signature', signature).send({ eventId, paymentId });

  async function orderWithCheckout() {
    const res = await placeOrder(h, a, [{ variantId: item.variantId, quantity: 1 }]);
    expect(res.body.payment.status).toBe('READY');
    const checkout = h.payments.checkouts.at(-1)!;
    // O frete vai como item para que a soma bata com o total do pedido.
    expect(checkout.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)).toBe(checkout.amount);
    return { res, reference: checkout.externalReference, amount: checkout.amount };
  }

  it('webhook aprovado marca o pedido como pago e registra uma única receita', async () => {
    const { res, reference, amount } = await orderWithCheckout();
    const paymentId = h.payments.setRemote(reference, 'APPROVED', amount);

    expect((await webhook('evt-1', paymentId)).body).toEqual({ result: 'approved' });
    expect((await webhook('evt-1', paymentId)).body).toEqual({ result: 'duplicate' });
    expect((await webhook('evt-2', paymentId)).body).toEqual({ result: 'unchanged' });

    const tracked = await h.api.get(`/api/v1/public/orders/${res.body.order.number}`).set(asStore(a)).set('X-Order-Token', res.body.trackingToken);
    expect(tracked.body.status).toBe('PAID');

    const tx = await h.api.get('/api/v1/finance/transactions').set(asTenant(a)).query({ kind: 'INCOME' });
    expect(tx.body.items).toHaveLength(1);
    expect(tx.body.items[0]).toMatchObject({ amount: 21000, status: 'PAID', categoryName: 'Vendas' });
  });

  it('assinatura inválida é rejeitada e nada muda', async () => {
    const { reference, amount } = await orderWithCheckout();
    const paymentId = h.payments.setRemote(reference, 'APPROVED', amount);
    expect((await webhook('evt-x', paymentId, 'errada')).status).toBe(401);
    const { body } = await h.api.get('/api/v1/orders').set(asTenant(a));
    expect(body.items[0].status).toBe('PENDING_PAYMENT');
  });

  it('valor divergente não marca o pedido como pago', async () => {
    const { reference, amount } = await orderWithCheckout();
    const paymentId = h.payments.setRemote(reference, 'APPROVED', amount - 1);
    expect((await webhook('evt-1', paymentId)).body.result).toBe('amount-mismatch');
    const { body } = await h.api.get('/api/v1/orders').set(asTenant(a));
    expect(body.items[0].status).toBe('PENDING_PAYMENT');
  });

  it('recusa mantém o pedido aguardando; notificação atrasada de "pendente" não desfaz aprovação', async () => {
    const { reference, amount } = await orderWithCheckout();
    const rejected = h.payments.setRemote(reference, 'REJECTED', amount, 'pay-1');
    expect((await webhook('evt-1', rejected)).body.result).toBe('rejected');
    h.payments.setRemote(reference, 'APPROVED', amount, 'pay-1');
    expect((await webhook('evt-2', 'pay-1')).body.result).toBe('approved');
    h.payments.setRemote(reference, 'PENDING', amount, 'pay-1');
    expect((await webhook('evt-3', 'pay-1')).body.result).toBe('ignored-APPROVED-to-PENDING');
    const { body } = await h.api.get('/api/v1/orders').set(asTenant(a));
    expect(body.items[0].status).toBe('PAID');
  });

  it('resumo financeiro separa pedidos criados, vendas aprovadas, recebido e despesas', async () => {
    const { reference, amount } = await orderWithCheckout(); // 21000 aprovado
    await placeOrder(h, a, [{ variantId: item.variantId, quantity: 2 }]); // 41000 criado, não pago
    await webhook('evt-1', h.payments.setRemote(reference, 'APPROVED', amount));

    const today = new Date().toISOString().slice(0, 10);
    await h.api.post('/api/v1/finance/expenses').set(asTenant(a)).send({ description: 'Tecido', amount: 5000, competenceDate: today, paidAt: new Date().toISOString() });
    await h.api.post('/api/v1/finance/expenses').set(asTenant(a)).send({ description: 'Anúncio a pagar', amount: 3000, competenceDate: today });

    const summary = await h.api.get('/api/v1/finance/summary').set(asTenant(a));
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      ordersCreated: { count: 2, total: 62000 },
      salesApproved: { count: 1, total: 21000 },
      received: 21000,
      expensesPaid: 5000,
      expensesByCompetence: 8000,
      cashResult: 16000,
    });
    const cashflow = await h.api.get('/api/v1/finance/reports/cashflow').set(asTenant(a)).query({ groupBy: 'day' });
    expect(cashflow.body.items).toEqual([{ period: today, income: 21000, expense: 5000 }]);
  });
});

describe.skipIf(!hasDatabase)('operação', () => {
  let h: Harness;
  beforeAll(() => {
    h = createHarness();
  });
  afterAll(() => h.close());

  it('health, ready e documentação OpenAPI', async () => {
    expect((await h.api.get('/health')).body.status).toBe('ok');
    expect((await h.api.get('/ready')).body.status).toBe('ready');
    const doc = await h.api.get('/openapi.json');
    expect(doc.body.openapi).toBe('3.0.3');
    expect(Object.keys(doc.body.paths)).toContain('/api/v1/checkout/orders');
  });

  it('responde erros no formato padrão', async () => {
    const res = await h.api.get('/api/v1/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body.error.requestId).toBeTypeOf('string');
  });
});
