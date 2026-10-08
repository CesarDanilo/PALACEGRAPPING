// Raiz de composição: o único lugar que conhece implementações concretas.
import { AuthService } from './application/auth/auth.service.js';
import { CatalogService } from './application/catalogs/catalog.service.js';
import { CheckoutService } from './application/checkout/checkout.service.js';
import { StoreRuleShippingCalculator } from './application/checkout/store-shipping.js';
import { CustomerService } from './application/customers/customer.service.js';
import { DashboardService } from './application/dashboard/dashboard.service.js';
import { FinanceService } from './application/finance/finance.service.js';
import { InventoryService } from './application/inventory/inventory.service.js';
import { OrderService } from './application/orders/order.service.js';
import { PaymentService } from './application/payments/payment.service.js';
import type { UnitOfWork } from './application/ports/repositories.js';
import type { AccessTokenService, Clock, ObjectStorage, PasswordHasher, PaymentProvider } from './application/ports/services.js';
import { CategoryService } from './application/products/category.service.js';
import { ProductService } from './application/products/product.service.js';
import { StorefrontService } from './application/storefront/storefront.service.js';
import { TenantService } from './application/tenants/tenant.service.js';
import type { Env } from './config/env.js';
import { createPrismaClient, translatePrismaError } from './infrastructure/prisma/client.js';
import { PrismaUnitOfWork } from './infrastructure/prisma/unit-of-work.js';
import { MercadoPagoProvider } from './infrastructure/payments/mercadopago.provider.js';
import { Argon2PasswordHasher, JwtAccessTokenService, systemClock } from './infrastructure/security/security.js';
import { SupabaseObjectStorage, unconfiguredStorage } from './infrastructure/storage/supabase-storage.js';
import { createLogger, type Logger } from './shared/logger.js';
import { sha256 } from './shared/crypto.js';

export interface Overrides {
  clock?: Clock;
  storage?: ObjectStorage;
  paymentProviders?: PaymentProvider[];
  logger?: Logger;
}

export function buildContainer(env: Env, overrides: Overrides = {}) {
  const logger = overrides.logger ?? createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
  const prisma = createPrismaClient(env.DATABASE_URL);
  const uow: UnitOfWork = new PrismaUnitOfWork(prisma);
  const clock = overrides.clock ?? systemClock;
  const hasher: PasswordHasher = new Argon2PasswordHasher();
  const tokens: AccessTokenService = new JwtAccessTokenService(env.JWT_ACCESS_SECRET, env.ACCESS_TOKEN_TTL_SECONDS, clock);
  const storage =
    overrides.storage ??
    (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? new SupabaseObjectStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_STORAGE_BUCKET)
      : unconfiguredStorage);
  const providers = overrides.paymentProviders ?? [new MercadoPagoProvider(env.MERCADOPAGO_ACCESS_TOKEN, env.MERCADOPAGO_WEBHOOK_SECRET)];

  const catalogs = new CatalogService(uow, clock);
  const finance = new FinanceService(uow);
  const services = {
    auth: new AuthService(uow, hasher, tokens, clock, env.REFRESH_TOKEN_TTL_DAYS),
    tenants: new TenantService(uow, hasher),
    categories: new CategoryService(uow),
    products: new ProductService(uow, storage, clock, env.UPLOAD_MAX_BYTES),
    inventory: new InventoryService(uow),
    catalogs,
    storefront: new StorefrontService(uow),
    // Segredo do token de acompanhamento derivado do segredo JWT (domínio separado).
    checkout: new CheckoutService(uow, catalogs, new StoreRuleShippingCalculator(uow), clock, sha256(`tracking:${env.JWT_ACCESS_SECRET}`)),
    orders: new OrderService(uow, clock),
    payments: new PaymentService(uow, providers, clock, logger, { storefront: env.STOREFRONT_URL, publicApi: env.PUBLIC_API_URL }),
    customers: new CustomerService(uow),
    finance,
    dashboard: new DashboardService(uow, finance),
  };

  return {
    env,
    logger,
    uow,
    tokens,
    storage,
    providers,
    services,
    translateError: translatePrismaError,
    close: () => prisma.$disconnect(),
  };
}

export type Container = ReturnType<typeof buildContainer>;
export type Services = Container['services'];
