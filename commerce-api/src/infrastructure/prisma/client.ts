import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { UniqueViolationError } from '../../shared/errors.js';

export type Db = PrismaClient | Prisma.TransactionClient;

export function createPrismaClient(databaseUrl: string): PrismaClient {
  // Com o pooler do Supabase em modo transaction (porta 6543) não há prepared statements
  // persistentes; o adapter pg não depende deles.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

/** Extrai os campos de uma violação de unicidade, com ou sem driver adapter. */
function uniqueFields(error: Prisma.PrismaClientKnownRequestError): string[] {
  const meta = (error.meta ?? {}) as Record<string, unknown>;
  if (Array.isArray(meta.target)) return meta.target.map(String);
  if (typeof meta.target === 'string') return [meta.target];
  const cause = (meta.driverAdapterError as { cause?: { constraint?: { fields?: string[]; index?: string } } } | undefined)?.cause;
  if (cause?.constraint?.fields) return cause.constraint.fields.map((f) => f.replace(/"/g, ''));
  // Com driver adapter o Postgres informa o índice, ex.: "Order_tenantId_idempotencyKey_key".
  const index = cause?.constraint?.index;
  if (index) return index.replace(/_(key|idx)$/, '').split('_').slice(1);
  return [];
}

/** Converte erros conhecidos do Prisma em erros de aplicação; demais erros passam intactos. */
export function translatePrismaError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new UniqueViolationError(uniqueFields(error));
  }
  return error;
}
