import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');
const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3350),
    PUBLIC_API_URL: z.url().default('http://localhost:3350'),
    CORS_ORIGINS: z.string().default('http://localhost:5190'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    ENABLE_API_DOCS: bool.default(true),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET precisa de pelo menos 32 caracteres'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
    COOKIE_SECURE: bool.default(false),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

    SUPABASE_URL: optional,
    SUPABASE_SERVICE_ROLE_KEY: optional,
    SUPABASE_STORAGE_BUCKET: z.string().default('product-images'),
    UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),

    MERCADOPAGO_ACCESS_TOKEN: optional,
    MERCADOPAGO_WEBHOOK_SECRET: optional,
    STOREFRONT_URL: z.url().default('http://localhost:5190'),

    EXPIRATION_SWEEP_SECONDS: z.coerce.number().int().min(0).default(60),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'Em produção COOKIE_SECURE deve ser true' });
      }
      if (env.JWT_ACCESS_SECRET.startsWith('troque-')) {
        ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'Troque o segredo de exemplo' });
      }
      if (env.MERCADOPAGO_ACCESS_TOKEN && !env.MERCADOPAGO_WEBHOOK_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['MERCADOPAGO_WEBHOOK_SECRET'],
          message: 'Webhooks sem assinatura não são aceitos em produção',
        });
      }
    }
    if (env.COOKIE_SAMESITE === 'none' && !env.COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SAMESITE'], message: 'SameSite=None exige COOKIE_SECURE=true' });
    }
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${details}`);
  }
  return parsed.data;
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
