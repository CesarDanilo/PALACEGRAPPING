import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { corsOrigins } from '../../config/env.js';
import type { Container } from '../../container.js';
import { apiLimiter, errorHandler, notFoundHandler, requestId, requireStore, requireTenant, requireUser } from './middlewares.js';
import { buildOpenApi } from './openapi.js';
import { type Access, registry } from './route-kit.js';
import { registerAccountRoutes } from './routes/account.routes.js';
import { registerCatalogRoutes } from './routes/catalog.routes.js';
import { registerOperationsRoutes } from './routes/operations.routes.js';
import { registerPublicRoutes } from './routes/public.routes.js';

export const API_VERSION = '0.1.0';

export function createApp(c: Container) {
  const app = express();
  app.disable('x-powered-by');
  // Atrás de um proxy (Render, Fly, Nginx), o IP real vem de X-Forwarded-For.
  app.set('trust proxy', c.env.NODE_ENV === 'production' ? 1 : false);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger: c.logger,
      genReqId: (req) => (req as express.Request).id,
      autoLogging: c.env.NODE_ENV === 'test' ? false : { ignore: (req) => req.url === '/health' || req.url === '/ready' },
    }),
  );
  app.use(helmet());

  // CORS restrito às origens configuradas; credenciais apenas para o cookie de refresh.
  const allowed = new Set(corsOrigins(c.env));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
      credentials: true,
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Id', 'X-Store', 'X-Order-Token', 'Idempotency-Key', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: API_VERSION });
  });
  app.get('/ready', async (_req, res) => {
    try {
      await c.uow.ping();
      res.json({ status: 'ready', storage: c.storage.configured, payments: c.providers.filter((p) => p.configured).map((p) => p.name) });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  const user = requireUser(c.tokens);
  const guards: Record<Access, RequestHandler[]> = {
    public: [],
    webhook: [],
    store: [requireStore(c.services.storefront)],
    user: [user],
    tenant: [user, requireTenant(c.uow)],
  };

  registry.length = 0;
  const v1 = express.Router();
  v1.use(apiLimiter(c.env.NODE_ENV !== 'test'));
  registerAccountRoutes(v1, guards, c);
  registerCatalogRoutes(v1, guards, c);
  registerOperationsRoutes(v1, guards, c);
  registerPublicRoutes(v1, guards, c);
  app.use('/api/v1', v1);

  if (c.env.ENABLE_API_DOCS) {
    const doc = buildOpenApi(API_VERSION);
    app.get('/openapi.json', (_req, res) => {
      res.json(doc);
    });
    app.use('/docs', helmet({ contentSecurityPolicy: false }), swaggerUi.serve, swaggerUi.setup(doc));
  }

  app.use(notFoundHandler);
  app.use(errorHandler(c.logger, c.translateError));
  return app;
}
