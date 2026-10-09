import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { TenantContext } from '../../application/context.js';
import type { UnitOfWork } from '../../application/ports/repositories.js';
import type { TenantRecord } from '../../application/ports/records.js';
import type { AccessTokenService } from '../../application/ports/services.js';
import type { StorefrontService } from '../../application/storefront/storefront.service.js';
import { AppError, forbidden, unauthenticated } from '../../shared/errors.js';
import type { Logger } from '../../shared/logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
    auth?: { userId: string; email: string };
    tenantCtx?: TenantContext;
    store?: TenantRecord;
  }
}

const asyncMw =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).then(() => next(), next);
  };

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

/** Exige Bearer token válido. Não determina loja nem papel. */
export const requireUser = (tokens: AccessTokenService): RequestHandler =>
  asyncMw(async (req) => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw unauthenticated();
    const claims = await tokens.verify(header.slice(7));
    req.auth = { userId: claims.sub, email: claims.email };
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a loja da operação administrativa a partir de X-Tenant-Id e
 * verifica no banco, a cada requisição, que o usuário é membro dela.
 * Um tenantId enviado pelo cliente sem associação resulta em 403.
 */
export const requireTenant = (uow: UnitOfWork): RequestHandler =>
  asyncMw(async (req) => {
    if (!req.auth) throw unauthenticated();
    const tenantId = req.header('x-tenant-id');
    if (!tenantId || !UUID.test(tenantId)) throw new AppError('VALIDATION_ERROR', 'Cabeçalho X-Tenant-Id ausente ou inválido');
    const [user, role, tenant] = await Promise.all([
      uow.repos.users.findById(req.auth.userId),
      uow.repos.tenants.findRole(req.auth.userId, tenantId),
      uow.repos.tenants.findById(tenantId),
    ]);
    if (!user?.isActive) throw unauthenticated('Usuário inativo');
    if (!role || !tenant) throw forbidden('Você não tem acesso a esta loja');
    if (tenant.status !== 'ACTIVE') throw forbidden('Loja suspensa');
    req.tenantCtx = { tenantId, userId: req.auth.userId, role };
  });

/** Vitrine pública: a loja vem do cabeçalho X-Store (slug). Não concede nenhum acesso administrativo. */
export const requireStore = (storefront: StorefrontService): RequestHandler =>
  asyncMw(async (req) => {
    const slug = req.header('x-store');
    if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) throw new AppError('VALIDATION_ERROR', 'Cabeçalho X-Store ausente ou inválido');
    req.store = await storefront.resolveStore(slug);
  });

export function ctxOf(req: Request): TenantContext {
  if (!req.tenantCtx) throw unauthenticated();
  return req.tenantCtx;
}

export function storeOf(req: Request): TenantRecord {
  if (!req.store) throw new AppError('VALIDATION_ERROR', 'Loja não informada');
  return req.store;
}

export function userOf(req: Request) {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}

const limitHandler: RequestHandler = (_req, _res, next: NextFunction) =>
  next(new AppError('TOO_MANY_REQUESTS', 'Muitas requisições; tente novamente em instantes'));

export const loginLimiter = (enabled: boolean, limit = 10) =>
  rateLimit({ windowMs: 15 * 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false, skip: () => !enabled, handler: limitHandler });

/** Renovação de sessão: cada recarga de página do painel chama /auth/refresh. */
export const refreshLimiter = (enabled: boolean) =>
  rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, skip: () => !enabled, handler: limitHandler });

export const checkoutLimiter = (enabled: boolean) =>
  rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, skip: () => !enabled, handler: limitHandler });

export const apiLimiter = (enabled: boolean) =>
  rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false, skip: () => !enabled, handler: limitHandler });

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(new AppError('NOT_FOUND', 'Rota não encontrada'));

/** Formato único de erro: { error: { code, message, details?, requestId } }. */
export const errorHandler =
  (logger: Logger, translate: (error: unknown) => unknown = (e) => e): ErrorRequestHandler =>
  (rawError, req, res, _next) => {
    let error = translate(rawError);
    if (error && typeof error === 'object' && 'type' in error && (error as { type: string }).type === 'entity.parse.failed') {
      error = new AppError('VALIDATION_ERROR', 'JSON inválido');
    }
    if (error && typeof error === 'object' && 'type' in error && (error as { type: string }).type === 'entity.too.large') {
      error = new AppError('PAYLOAD_TOO_LARGE', 'Corpo da requisição muito grande');
    }
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'LIMIT_FILE_SIZE') {
      error = new AppError('PAYLOAD_TOO_LARGE', 'Arquivo acima do tamanho permitido');
    }
    if (error instanceof AppError) {
      if (error.status >= 500) logger.error({ err: error, requestId: req.id }, error.message);
      res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details, requestId: req.id } });
      return;
    }
    logger.error({ err: error, requestId: req.id }, 'erro não tratado');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno', requestId: req.id } });
  };
