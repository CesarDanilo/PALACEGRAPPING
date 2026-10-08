import type { CookieOptions, Request, RequestHandler, Router } from 'express';
import { z } from 'zod';
import { ROLES } from '../../../domain/access/permissions.js';
import type { Container } from '../../../container.js';
import { ctxOf, loginLimiter, userOf } from '../middlewares.js';
import { centsSchema, route, slugSchema, type Access } from '../route-kit.js';

const REFRESH_COOKIE = 'rt';

export function registerAccountRoutes(router: Router, guards: Record<Access, RequestHandler[]>, c: Container) {
  const { auth, tenants } = c.services;
  const cookieOptions = (expires?: Date): CookieOptions => ({
    httpOnly: true,
    secure: c.env.COOKIE_SECURE,
    sameSite: c.env.COOKIE_SAMESITE,
    path: '/api/v1/auth',
    ...(expires ? { expires } : {}),
  });
  const meta = (req: Request) => ({ userAgent: req.header('user-agent') ?? null, ip: req.ip ?? null });

  route(router, guards, {
    method: 'post',
    path: '/auth/login',
    tag: 'Autenticação',
    summary: 'Login administrativo. Devolve access token e grava o refresh token em cookie httpOnly.',
    access: 'public',
    before: [loginLimiter(c.env.NODE_ENV !== 'test')],
    body: z.object({ email: z.email().max(254), password: z.string().min(1).max(200) }),
  }, async ({ body, req, res }) => {
    const { session, profile } = await auth.login(body.email, body.password, meta(req));
    res.cookie(REFRESH_COOKIE, session.refreshToken, cookieOptions(session.refreshExpiresAt));
    return { accessToken: session.accessToken, expiresIn: session.expiresIn, ...profile };
  });

  route(router, guards, {
    method: 'post',
    path: '/auth/refresh',
    tag: 'Autenticação',
    summary: 'Renova o access token com rotação do refresh token (cookie).',
    access: 'public',
    before: [loginLimiter(c.env.NODE_ENV !== 'test')],
  }, async ({ req, res }) => {
    const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (!token) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sessão ausente', requestId: req.id } });
      return;
    }
    try {
      const session = await auth.refresh(token, meta(req));
      res.cookie(REFRESH_COOKIE, session.refreshToken, cookieOptions(session.refreshExpiresAt));
      return { accessToken: session.accessToken, expiresIn: session.expiresIn };
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE, cookieOptions());
      throw error;
    }
  });

  route(router, guards, {
    method: 'post',
    path: '/auth/logout',
    tag: 'Autenticação',
    summary: 'Revoga a sessão atual (família de refresh tokens).',
    access: 'public',
  }, async ({ req, res }) => {
    await auth.logout((req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    return undefined;
  });

  route(router, guards, {
    method: 'get',
    path: '/auth/me',
    tag: 'Autenticação',
    summary: 'Usuário autenticado e lojas às quais pertence, com papéis e permissões.',
    access: 'user',
  }, async ({ req }) => auth.profile(userOf(req).userId));

  route(router, guards, {
    method: 'get',
    path: '/tenants',
    tag: 'Lojas',
    summary: 'Lojas do usuário autenticado.',
    access: 'user',
  }, async ({ req }) => ({ items: await tenants.listForUser(userOf(req).userId) }));

  route(router, guards, {
    method: 'post',
    path: '/tenants',
    tag: 'Lojas',
    summary: 'Cria uma loja (somente administradores da plataforma). O criador vira OWNER.',
    access: 'user',
    status: 201,
    body: z.object({ slug: slugSchema, name: z.string().trim().min(2).max(120) }),
  }, async ({ body, req }) => tenants.create(userOf(req).userId, body));

  route(router, guards, {
    method: 'get',
    path: '/tenants/current',
    tag: 'Lojas',
    summary: 'Loja selecionada (X-Tenant-Id) e papel do usuário nela.',
    access: 'tenant',
  }, async ({ req }) => tenants.current(ctxOf(req)));

  route(router, guards, {
    method: 'get',
    path: '/tenants/current/members',
    tag: 'Lojas',
    summary: 'Membros da loja.',
    access: 'tenant',
  }, async ({ req }) => ({ items: await tenants.listMembers(ctxOf(req)) }));

  route(router, guards, {
    method: 'post',
    path: '/tenants/current/members',
    tag: 'Lojas',
    summary: 'Adiciona um membro (cria o usuário se não existir).',
    access: 'tenant',
    status: 201,
    body: z.object({
      email: z.email(),
      role: z.enum(ROLES),
      name: z.string().trim().min(2).max(120).optional(),
      password: z.string().min(10).max(200).optional(),
    }),
  }, async ({ body, req }) => tenants.addMember(ctxOf(req), body));

  route(router, guards, {
    method: 'patch',
    path: '/tenants/current/members/{userId}',
    tag: 'Lojas',
    summary: 'Altera o papel de um membro.',
    access: 'tenant',
    params: z.object({ userId: z.uuid() }),
    body: z.object({ role: z.enum(ROLES) }),
  }, async ({ params, body, req }) => {
    await tenants.changeRole(ctxOf(req), params.userId, body.role);
    return undefined;
  });

  route(router, guards, {
    method: 'delete',
    path: '/tenants/current/members/{userId}',
    tag: 'Lojas',
    summary: 'Remove um membro da loja.',
    access: 'tenant',
    params: z.object({ userId: z.uuid() }),
  }, async ({ params, req }) => {
    await tenants.removeMember(ctxOf(req), params.userId);
    return undefined;
  });

  route(router, guards, {
    method: 'get',
    path: '/settings',
    tag: 'Configurações',
    summary: 'Configurações comerciais da loja.',
    access: 'tenant',
  }, async ({ req }) => tenants.getSettings(ctxOf(req)));

  route(router, guards, {
    method: 'patch',
    path: '/settings',
    tag: 'Configurações',
    summary: 'Atualiza configurações comerciais (frete, prazo de pagamento, contato).',
    access: 'tenant',
    body: z
      .object({
        currency: z.string().length(3).toUpperCase(),
        orderNumberPrefix: z.string().max(8).regex(/^[A-Z0-9-]*$/),
        shippingMode: z.enum(['FLAT_RATE', 'FREE']),
        shippingFlatRate: centsSchema,
        freeShippingThreshold: centsSchema.nullable(),
        pendingPaymentTtlMinutes: z.number().int().min(10).max(7 * 24 * 60),
        lowStockThreshold: z.number().int().min(0).max(1000),
        contactEmail: z.email().nullable(),
        contactPhone: z.string().max(30).nullable(),
        termsUrl: z.url().nullable(),
      })
      .partial(),
  }, async ({ body, req }) => tenants.updateSettings(ctxOf(req), body));
}
