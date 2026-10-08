import { config } from '@/config/env';
import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Rotas de vitrine: envia X-Store. */
  store?: boolean;
  /** Rotas administrativas: envia Bearer + X-Tenant-Id e renova a sessão se expirar. */
  admin?: boolean;
}

// ── Sessão administrativa ──
// O access token fica só em memória; o refresh token é um cookie httpOnly
// que o JavaScript não lê. Recarregar a página renova a sessão via /auth/refresh.
let accessToken: string | null = null;
let tenantId: string | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

export const session = {
  get token() {
    return accessToken;
  },
  get tenantId() {
    return tenantId;
  },
  set(token: string | null) {
    accessToken = token;
    listeners.forEach((l) => l());
  },
  selectTenant(id: string | null) {
    tenantId = id;
    try {
      if (id) localStorage.setItem('pg.admin.tenant', id);
      else localStorage.removeItem('pg.admin.tenant');
    } catch {
      /* armazenamento indisponível */
    }
  },
  rememberedTenant(): string | null {
    try {
      return localStorage.getItem('pg.admin.tenant');
    } catch {
      return null;
    }
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

function buildUrl(path: string, query?: RequestOptions['query']) {
  const url = new URL(`${config.apiUrl}/api/v1${path}`, window.location.origin);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return config.apiUrl ? url.toString() : `${url.pathname}${url.search}`;
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  } catch {
    return new ApiError(res.status, 'HTTP_ERROR', `Erro ${res.status}`);
  }
}

export async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(buildUrl('/auth/refresh'), { method: 'POST', credentials: 'include' });
      if (!res.ok) {
        session.set(null);
        return false;
      }
      const data = (await res.json()) as { accessToken: string };
      session.set(data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) body = options.body;
  else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (options.store) headers['X-Store'] = config.storeSlug;
  if (options.admin) {
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (tenantId) headers['X-Tenant-Id'] = tenantId;
  }

  const res = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body,
    signal: options.signal,
    credentials: 'include',
  });

  if (res.status === 401 && options.admin && !retried && (await refreshSession())) {
    return api<T>(path, options, true);
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
