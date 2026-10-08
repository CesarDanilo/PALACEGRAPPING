import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import { cents } from '../../shared/money.js';

export type Access = 'public' | 'store' | 'user' | 'tenant' | 'webhook';

export interface RouteDef<B extends z.ZodType, Q extends z.ZodType, P extends z.ZodType> {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  summary: string;
  tag: string;
  access: Access;
  body?: B;
  query?: Q;
  params?: P;
  status?: number;
  /** Middlewares extras antes da validação (ex.: upload multipart, rate limit). */
  before?: RequestHandler[];
  headers?: { name: string; required: boolean; description: string }[];
}

export interface HandlerInput<B, Q, P> {
  body: B;
  query: Q;
  params: P;
  req: Request;
  res: Response;
}

/** Rotas registradas, usadas para gerar o documento OpenAPI. */
export const registry: RouteDef<z.ZodType, z.ZodType, z.ZodType>[] = [];

export function parseWith<T extends z.ZodType>(schema: T, data: unknown, where: string): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', `Requisição inválida (${where})`, {
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}

/**
 * Registra uma rota com validação Zod de body/query/params e metadados para o OpenAPI.
 * O handler devolve o corpo da resposta (ou undefined para 204).
 */
export function route<B extends z.ZodType = z.ZodUndefined, Q extends z.ZodType = z.ZodUndefined, P extends z.ZodType = z.ZodUndefined>(
  router: Router,
  guards: Record<Access, RequestHandler[]>,
  def: RouteDef<B, Q, P>,
  handler: (input: HandlerInput<z.output<B>, z.output<Q>, z.output<P>>) => Promise<unknown>,
): void {
  registry.push(def as unknown as RouteDef<z.ZodType, z.ZodType, z.ZodType>);
  const expressPath = def.path.replace(/\{(\w+)\}/g, ':$1');
  const run = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = def.body ? parseWith(def.body, req.body, 'body') : undefined;
      const query = def.query ? parseWith(def.query, req.query, 'query') : undefined;
      const params = def.params ? parseWith(def.params, req.params, 'params') : undefined;
      const result = await handler({ body, query, params, req, res } as HandlerInput<z.output<B>, z.output<Q>, z.output<P>>);
      if (res.headersSent) return;
      if (result === undefined) res.status(204).end();
      else res.status((res.locals.status as number | undefined) ?? def.status ?? 200).json(result);
    } catch (error) {
      next(error);
    }
  };
  router[def.method](expressPath, ...guards[def.access], ...(def.before ?? []), run);
}

// ── Schemas reutilizáveis ──

export const uuid = z.uuid();
export const idParams = z.object({ id: z.uuid() });
export const slugSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífens');
/** Valores monetários são inteiros em centavos (ex.: 19990 = R$ 199,90). */
export const centsSchema = z.number().int().min(0).max(999_999_999_999).transform((v) => cents(v));
export const isoDate = z.coerce.date();
export const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');
