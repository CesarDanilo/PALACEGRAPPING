// Erros de aplicação com código estável. A camada HTTP converte para respostas
// no formato { error: { code, message, details? } }.

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INSUFFICIENT_STOCK'
  | 'PRICE_CHANGED'
  | 'INVALID_STATE_TRANSITION'
  | 'LINK_UNAVAILABLE'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'TOO_MANY_REQUESTS'
  | 'SERVICE_UNAVAILABLE'
  | 'BAD_GATEWAY'
  | 'INTERNAL_ERROR';

const statusByCode: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
  PRICE_CHANGED: 409,
  INVALID_STATE_TRANSITION: 409,
  LINK_UNAVAILABLE: 410,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  TOO_MANY_REQUESTS: 429,
  SERVICE_UNAVAILABLE: 503,
  BAD_GATEWAY: 502,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = statusByCode[code];
  }
}

/** Violação de chave única traduzida pela infraestrutura (ex.: Prisma P2002). */
export class UniqueViolationError extends AppError {
  constructor(readonly fields: string[]) {
    super('CONFLICT', 'Registro duplicado', { fields });
  }
}

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} não encontrado(a)`);
export const forbidden = (message = 'Permissão insuficiente') => new AppError('FORBIDDEN', message);
export const unauthenticated = (message = 'Autenticação necessária') => new AppError('UNAUTHENTICATED', message);
export const conflict = (message: string, details?: unknown) => new AppError('CONFLICT', message, details);
export const validation = (message: string, details?: unknown) => new AppError('VALIDATION_ERROR', message, details);
