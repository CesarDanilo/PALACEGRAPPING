import { z } from 'zod';
import { registry } from './route-kit.js';

const toSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any', target: 'openapi-3.0' });

const security: Record<string, Record<string, string[]>[]> = {
  public: [],
  webhook: [],
  store: [],
  user: [{ bearerAuth: [] }],
  tenant: [{ bearerAuth: [], tenantHeader: [] }],
};

/** Documento OpenAPI 3.0 gerado a partir das rotas registradas (mesmos schemas Zod da validação). */
export function buildOpenApi(version: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const def of registry) {
    const fullPath = `/api/v1${def.path}`;
    const parameters: unknown[] = [];
    const paramNames = [...def.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const name of paramNames) parameters.push({ name, in: 'path', required: true, schema: { type: 'string' } });
    if (def.query) {
      const json = toSchema(def.query) as { properties?: Record<string, unknown>; required?: string[] };
      for (const [name, schema] of Object.entries(json.properties ?? {})) {
        parameters.push({ name, in: 'query', required: json.required?.includes(name) ?? false, schema });
      }
    }
    for (const h of def.headers ?? []) parameters.push({ name: h.name, in: 'header', required: h.required, description: h.description, schema: { type: 'string' } });

    const status = String(def.status ?? 200);
    paths[fullPath] ??= {};
    paths[fullPath][def.method] = {
      tags: [def.tag],
      summary: def.summary,
      security: security[def.access],
      parameters,
      ...(def.body ? { requestBody: { required: true, content: { 'application/json': { schema: toSchema(def.body) } } } } : {}),
      responses: {
        [status]: { description: 'Sucesso' },
        '4XX': { description: 'Erro do cliente', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Commerce API',
      version,
      description:
        'API comercial multi-tenant. Valores monetários são inteiros em centavos. Rotas administrativas exigem Bearer token e X-Tenant-Id; rotas de vitrine exigem X-Store.',
    },
    servers: [{ url: '/' }],
    paths: {
      '/health': { get: { tags: ['Operação'], summary: 'Liveness', responses: { '200': { description: 'OK' } } } },
      '/ready': { get: { tags: ['Operação'], summary: 'Readiness (banco acessível)', responses: { '200': { description: 'OK' }, '503': { description: 'Indisponível' } } } },
      ...paths,
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        tenantHeader: { type: 'apiKey', in: 'header', name: 'X-Tenant-Id', description: 'Loja selecionada; verificada contra a associação do usuário' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: { code: { type: 'string' }, message: { type: 'string' }, details: {}, requestId: { type: 'string' } },
              required: ['code', 'message'],
            },
          },
        },
      },
    },
  };
}
