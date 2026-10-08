import { loadEnv } from './config/env.js';
import { buildContainer } from './container.js';
import { createApp } from './presentation/http/app.js';

const env = loadEnv();
const container = buildContainer(env);
const app = createApp(container);
const { logger } = container;

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      storage: container.storage.configured,
      payments: container.providers.filter((p) => p.configured).map((p) => p.name),
    },
    'commerce-api ouvindo',
  );
});

// Varredura de pedidos sem pagamento: expira e devolve o estoque.
// É segura em múltiplas instâncias (transições condicionais no banco).
let sweeping = false;
const sweep =
  env.EXPIRATION_SWEEP_SECONDS > 0
    ? setInterval(async () => {
        if (sweeping) return;
        sweeping = true;
        try {
          const expired = await container.services.orders.expireOverdue();
          if (expired) logger.info({ expired }, 'pedidos expirados');
        } catch (error) {
          logger.error({ err: error }, 'falha na varredura de expiração');
        } finally {
          sweeping = false;
        }
      }, env.EXPIRATION_SWEEP_SECONDS * 1000)
    : null;

function shutdown(signal: string) {
  logger.info({ signal }, 'encerrando');
  if (sweep) clearInterval(sweep);
  server.close(() => {
    container.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
