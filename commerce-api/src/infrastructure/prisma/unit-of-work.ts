import type { Repositories, UnitOfWork } from '../../application/ports/repositories.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { type Db, translatePrismaError } from './client.js';
import { catalogLinkRepository, catalogRepository, categoryRepository, imageRepository, productRepository, stockMovementRepository, variantRepository } from './catalog.repositories.js';
import { financeRepository } from './finance.repository.js';
import { refreshTokenRepository, tenantRepository, userRepository } from './identity.repositories.js';
import { customerRepository, orderRepository, paymentEventRepository, paymentRepository } from './sales.repositories.js';

export function createRepositories(db: Db): Repositories {
  return {
    users: userRepository(db),
    refreshTokens: refreshTokenRepository(db),
    tenants: tenantRepository(db),
    categories: categoryRepository(db),
    products: productRepository(db),
    variants: variantRepository(db),
    images: imageRepository(db),
    stockMovements: stockMovementRepository(db),
    catalogs: catalogRepository(db),
    catalogLinks: catalogLinkRepository(db),
    customers: customerRepository(db),
    orders: orderRepository(db),
    payments: paymentRepository(db),
    paymentEvents: paymentEventRepository(db),
    finance: financeRepository(db),
  };
}

export class PrismaUnitOfWork implements UnitOfWork {
  readonly repos: Repositories;

  constructor(private readonly prisma: PrismaClient) {
    this.repos = createRepositories(prisma);
  }

  async transaction<T>(fn: (repos: Repositories) => Promise<T>): Promise<T> {
    try {
      // READ COMMITTED + travas de linha (UPDATE condicional / FOR UPDATE) garantem
      // a consistência de estoque e pagamentos sem exigir SERIALIZABLE.
      return await this.prisma.$transaction((tx) => fn(createRepositories(tx)), { timeout: 15_000, maxWait: 5_000 });
    } catch (error) {
      throw translatePrismaError(error);
    }
  }

  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
