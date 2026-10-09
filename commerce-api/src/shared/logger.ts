import { createRequire } from 'node:module';
import { pino, type Logger } from 'pino';

export type { Logger };

/** pino-pretty é dependência de desenvolvimento: na imagem de produção os logs saem em JSON. */
function prettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-order-token"]',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.refreshToken',
      ],
      censor: '[redacted]',
    },
    ...(pretty && prettyAvailable() ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  });
}
