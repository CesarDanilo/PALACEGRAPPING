// Ambiente de integração: API real + PostgreSQL real. Apenas dependências externas
// (provedor de pagamento e Storage) são substituídas por dublês controláveis.
// Estes testes NÃO comprovam a integração real com Mercado Pago ou Supabase.
import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import pg from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import type {
  CreateCheckoutInput,
  CreatedCheckout,
  ObjectStorage,
  ParsedWebhook,
  PaymentProvider,
  ProviderPayment,
  WebhookRequest,
} from '../../src/application/ports/services.js';
import { loadEnv } from '../../src/config/env.js';
import { buildContainer, type Container } from '../../src/container.js';
import type { PaymentStatus } from '../../src/domain/payments/payment-status.js';
import { createApp } from '../../src/presentation/http/app.js';
import { unauthenticated } from '../../src/shared/errors.js';
import { cents } from '../../src/shared/money.js';
import { createLogger } from '../../src/shared/logger.js';

export const databaseUrl = inject('testDatabaseUrl');
export const hasDatabase = Boolean(databaseUrl);

/** Provedor de pagamento falso. O teste define o estado "remoto" de cada pagamento. */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fakepay';
  readonly configured = true;
  readonly secret = 'fake-secret';
  checkouts: CreateCheckoutInput[] = [];
  remote = new Map<string, ProviderPayment>();

  async createCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout> {
    this.checkouts.push(input);
    return { checkoutId: `pref_${this.checkouts.length}`, checkoutUrl: `https://pay.example.test/${input.externalReference}` };
  }

  parseWebhook(req: WebhookRequest): ParsedWebhook {
    if (req.headers['x-fake-signature'] !== this.secret) throw unauthenticated('Assinatura inválida');
    const body = req.body as { eventId: string; paymentId: string };
    return { eventKey: body.eventId, type: 'payment', externalPaymentId: body.paymentId };
  }

  async fetchPayment(externalId: string): Promise<ProviderPayment> {
    const payment = this.remote.get(externalId);
    if (!payment) throw new Error(`pagamento remoto ${externalId} não definido no teste`);
    return payment;
  }

  /** Simula o provedor registrando um pagamento para a cobrança mais recente do pedido. */
  setRemote(externalReference: string, status: PaymentStatus, amount: number, externalId = `pay_${randomUUID().slice(0, 8)}`) {
    this.remote.set(externalId, { externalId, externalReference, status, rawStatus: status.toLowerCase(), amount: cents(amount), approvedAt: status === 'APPROVED' ? new Date() : null });
    return externalId;
  }
}

export class MemoryStorage implements ObjectStorage {
  readonly configured = true;
  objects = new Map<string, Buffer>();
  async upload(path: string, body: Buffer) {
    this.objects.set(path, body);
    return { path, publicUrl: `https://storage.example.test/${path}` };
  }
  async remove(paths: string[]) {
    for (const p of paths) this.objects.delete(p);
  }
}

export interface Harness {
  container: Container;
  api: ReturnType<typeof request>;
  payments: FakePaymentProvider;
  storage: MemoryStorage;
  clock: { now: () => Date; set(date: Date): void; reset(): void };
  close(): Promise<void>;
}

export function createHarness(): Harness {
  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: 'test-secret-with-more-than-thirty-two-characters',
    LOG_LEVEL: 'silent',
    ENABLE_API_DOCS: 'true',
    CORS_ORIGINS: 'http://localhost:5190',
  });
  let fixed: Date | null = null;
  const clock = { now: () => fixed ?? new Date(), set: (d: Date) => void (fixed = d), reset: () => void (fixed = null) };
  const payments = new FakePaymentProvider();
  const storage = new MemoryStorage();
  const container = buildContainer(env, { clock, paymentProviders: [payments], storage, logger: createLogger('silent', false) });
  const api = request(createApp(container));
  return { container, api, payments, storage, clock, close: () => container.close() };
}

/** Limpa todas as tabelas entre testes. */
export async function resetDatabase() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (rows.length) await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`);
  await client.end();
}

const fastHash = (password: string) => hash(password, { algorithm: 2, memoryCost: 1024, timeCost: 1, parallelism: 1 });

export interface SeededStore {
  tenantId: string;
  slug: string;
  ownerToken: string;
  ownerId: string;
}

/** Cria loja + OWNER diretamente no banco e devolve um access token válido. */
export async function seedStore(h: Harness, slug: string, opts: { flatRate?: number; freeAbove?: number | null } = {}): Promise<SeededStore> {
  const { repos } = h.container.uow;
  const owner = await repos.users.create({ email: `owner@${slug}.test`, name: `Owner ${slug}`, passwordHash: await fastHash('owner-password-123') });
  const tenant = await repos.tenants.createWithOwner({ slug, name: `Loja ${slug}`, ownerUserId: owner.id });
  await repos.tenants.updateSettings(tenant.id, {
    shippingFlatRate: cents(opts.flatRate ?? 2000),
    freeShippingThreshold: opts.freeAbove === undefined ? null : opts.freeAbove === null ? null : cents(opts.freeAbove),
  });
  const { token } = await h.container.tokens.sign({ sub: owner.id, email: owner.email });
  return { tenantId: tenant.id, slug, ownerToken: token, ownerId: owner.id };
}

export async function addMember(h: Harness, store: SeededStore, role: 'ADMIN' | 'OPERATOR') {
  const { repos } = h.container.uow;
  const user = await repos.users.create({ email: `${role.toLowerCase()}-${randomUUID().slice(0, 6)}@${store.slug}.test`, name: role, passwordHash: await fastHash('member-password-123') });
  await repos.tenants.upsertMember(store.tenantId, user.id, role);
  const { token } = await h.container.tokens.sign({ sub: user.id, email: user.email });
  return { userId: user.id, token };
}

export const asTenant = (store: SeededStore, token = store.ownerToken) => ({
  Authorization: `Bearer ${token}`,
  'X-Tenant-Id': store.tenantId,
});

export const asStore = (store: { slug: string }) => ({ 'X-Store': store.slug });

/** Cria um produto com uma variante via API administrativa. */
export async function createProduct(h: Harness, store: SeededStore, data: { slug: string; price: number; salePrice?: number | null; stock: number; sku?: string; isActive?: boolean }) {
  const res = await h.api
    .post('/api/v1/products')
    .set(asTenant(store))
    .send({
      name: `Produto ${data.slug}`,
      slug: data.slug,
      price: data.price,
      salePrice: data.salePrice ?? null,
      isActive: data.isActive ?? true,
      variants: [{ sku: data.sku ?? `${data.slug}-M`.toUpperCase(), size: 'M', color: 'Preto', stock: data.stock }],
    });
  if (res.status !== 201) throw new Error(`createProduct falhou: ${res.status} ${JSON.stringify(res.body)}`);
  const product = res.body as { id: string; variants: { id: string }[] };
  return { productId: product.id, variantId: product.variants[0]!.id };
}

export const customerPayload = {
  customer: { name: 'Cliente Teste', phone: '(11) 98888-7777', email: 'cliente@example.com' },
  address: { zipCode: '01310-100', street: 'Av. Paulista', number: '1000', complement: null, district: 'Bela Vista', city: 'São Paulo', state: 'SP' },
  paymentMethod: 'PIX' as const,
  acceptTerms: true as const,
};

export async function placeOrder(h: Harness, store: { slug: string }, items: { variantId: string; quantity: number }[], extra: Record<string, unknown> = {}, key = randomUUID()) {
  return h.api
    .post('/api/v1/checkout/orders')
    .set(asStore(store))
    .set('Idempotency-Key', key)
    .send({ items, ...customerPayload, ...extra });
}

export async function stockOf(h: Harness, tenantId: string, variantId: string) {
  return (await h.container.uow.repos.variants.findById(tenantId, variantId))?.stock;
}
