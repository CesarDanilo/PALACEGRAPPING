import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '@/app/App';
import { routes } from '@/app/router';
import { session } from '@/lib/api/client';

// Fluxo do painel com a API simulada no nível do fetch (a API real é coberta pelos
// testes de integração do backend).

type Handler = (url: string, init: RequestInit) => { status: number; body?: unknown };

function mockApi(handler: Handler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const { status, body } = handler(String(input), init);
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const profile = {
  user: { id: 'u1', email: 'dono@loja.test', name: 'Dono', isPlatformAdmin: false },
  memberships: [{ tenant: { id: 't1', slug: 'loja', name: 'Loja' }, role: 'OWNER', permissions: ['orders:read', 'catalog:read', 'finance:read'] }],
};

const dashboard = {
  period: { from: '2026-10-01', to: '2026-11-01' },
  pendingOrders: 2,
  toFulfil: 1,
  awaitingPayments: 2,
  lowStock: [],
  activity: [],
  finance: { ordersCreated: { count: 3, total: 90000 }, salesApproved: { count: 1, total: 30000 }, received: 30000, expensesPaid: 5000, expensesByCompetence: 5000, cashResult: 25000 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  session.set(null);
});

describe('painel administrativo', () => {
  it('redireciona para o login sem sessão', async () => {
    mockApi((url) => (url.endsWith('/auth/refresh') ? { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } } : { status: 404 }));
    const router = renderAt('/admin/pedidos');
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/login'), { timeout: 5000 });
    expect(await screen.findByRole('heading', { name: 'Entrar no painel' }, { timeout: 5000 })).toBeInTheDocument();

  });

  it('valida o formulário, faz login e mostra o painel com X-Tenant-Id', async () => {
    const fetchMock = mockApi((url) => {
      if (url.endsWith('/auth/refresh')) return { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } };
      if (url.endsWith('/auth/login')) return { status: 200, body: { accessToken: 'tok', expiresIn: 900, ...profile } };
      if (url.includes('/dashboard')) return { status: 200, body: dashboard };
      return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'x' } } };
    });
    const user = userEvent.setup();
    renderAt('/admin/login');

    await user.click(await screen.findByRole('button', { name: 'Entrar' }, { timeout: 5000 }));
    expect(await screen.findByText('Informe um e-mail válido')).toBeInTheDocument();

    await user.type(screen.getByLabelText('E-mail'), 'dono@loja.test');
    await user.type(screen.getByLabelText('Senha'), 'senha-secreta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Painel' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Resultado de caixa')).toBeInTheDocument();
    const dashboardCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/dashboard'));
    const headers = dashboardCall![1]!.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['X-Tenant-Id']).toBe('t1');
  });

  it('mostra a mensagem da API quando as credenciais são inválidas', async () => {
    mockApi((url) => {
      if (url.endsWith('/auth/login')) return { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'E-mail ou senha inválidos' } } };
      return { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'x' } } };
    });
    const user = userEvent.setup();
    renderAt('/admin/login');
    await user.type(await screen.findByLabelText('E-mail', {}, { timeout: 5000 }), 'dono@loja.test');
    await user.type(screen.getByLabelText('Senha'), 'errada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos');
  });
});

describe('loja', () => {
  it('envia X-Store nas rotas públicas e mostra o estado de erro', async () => {
    const fetchMock = mockApi(() => ({ status: 503, body: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Indisponível' } } }));
    renderAt('/colecoes');
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent('Indisponível');
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['X-Store']).toBe('palace-grappling');
  });
});
