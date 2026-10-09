import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useParams, useSearchParams } from 'react-router';
import { z } from '@/lib/zod';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import { adminApi, type AdminOrder, type Settings, type Transaction } from '@/lib/api/admin';
import { ApiError, api, session } from '@/lib/api/client';
import type { LoginResponse, OrderStatus } from '@/lib/api/types';
import { centsSchema, emailSchema, passwordSchema, phoneSchema, toNumber } from '@/lib/validation';
import { MoneyField, PageHeader, Pager, Panel, StatusPill, date, dateTime, errorMessage, money, orderStatusText, useAdminKey, useAdminMutation } from './common';
import { Callout, Kpi } from './highlights';
import { TeamPanel } from './TeamPanel';
import { ChartIcon, OrdersIcon, WalletIcon } from '@/components/icons';
import styles from './admin.module.css';

const intInput = { setValueAs: (v: string | number) => (typeof v === 'number' ? v : toNumber(v)) };

const sourceLabel: Record<AdminOrder['source'], string> = { STOREFRONT: 'Loja', CATALOG: 'Catálogo', CATALOG_LINK: 'Link exclusivo', ADMIN: 'Painel' };

function usePageParam() {
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set(k, v);
      else next.delete(k);
      if (k !== 'pagina') next.delete('pagina');
      return next;
    });
  return { params, set, page: Number(params.get('pagina') ?? 1) };
}

// ───────────────────────── Pedidos ─────────────────────────

export function OrdersPage() {
  const key = useAdminKey();
  const { params, set, page } = usePageParam();
  const status = (params.get('status') as OrderStatus | null) ?? undefined;
  const search = params.get('q') ?? undefined;
  const orders = useQuery({
    queryKey: key('orders', status, search, page),
    queryFn: () => adminApi.orders({ status, search, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className={styles.page}>
      <PageHeader title="Pedidos" description="Pagamento é confirmado pelo provedor; preparação, envio e entrega são registrados aqui." />
      <div className={styles.toolbar}>
        <label className={styles.field}>
          <span>Status</span>
          <select value={status ?? ''} onChange={(e) => set('status', e.target.value || null)}>
            <option value="">Todos</option>
            {Object.entries(orderStatusText).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            set('q', String(new FormData(e.currentTarget).get('q') ?? '') || null);
          }}
          className={styles.toolbar}
        >
          <label className={styles.field}>
            <span>Número, nome ou e-mail</span>
            <input name="q" defaultValue={search} />
          </label>
          <Button size="sm" variant="secondary" type="submit">
            Buscar
          </Button>
        </form>
      </div>
      <Panel>
        {orders.isPending ? (
          <LoadingState />
        ) : orders.isError ? (
          <Alert tone="danger">{errorMessage(orders.error)}</Alert>
        ) : !orders.data.items.length ? (
          <EmptyState title="Nenhum pedido" />
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Pedido</th>
                  <th scope="col">Data</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Origem</th>
                  <th scope="col">Status</th>
                  <th scope="col" className={styles.num}>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.data.items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/admin/pedidos/${o.id}`} className={`${styles.rowLink} ${styles.code}`}>
                        {o.number}
                      </Link>
                    </td>
                    <td>{dateTime(o.createdAt)}</td>
                    <td>{o.customerName}</td>
                    <td>{sourceLabel[o.source]}</td>
                    <td>
                      <StatusPill status={o.status} />
                    </td>
                    <td className={styles.num}>{money(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={orders.data.page} totalPages={orders.data.totalPages} onChange={(p) => set('pagina', String(p))} />
          </>
        )}
      </Panel>
    </div>
  );
}

const nextActions: Partial<Record<OrderStatus, { status: OrderStatus; label: string; danger?: boolean }[]>> = {
  PENDING_PAYMENT: [{ status: 'CANCELLED', label: 'Cancelar pedido', danger: true }],
  PAID: [
    { status: 'PREPARING', label: 'Iniciar preparação' },
    { status: 'CANCELLED', label: 'Cancelar', danger: true },
  ],
  PREPARING: [
    { status: 'SHIPPED', label: 'Marcar como enviado' },
    { status: 'CANCELLED', label: 'Cancelar', danger: true },
  ],
  SHIPPED: [
    { status: 'DELIVERED', label: 'Marcar como entregue' },
    { status: 'RETURNED', label: 'Registrar devolução', danger: true },
  ],
  DELIVERED: [{ status: 'RETURNED', label: 'Registrar devolução', danger: true }],
};

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const key = useAdminKey();
  const { can } = useAdminSession();
  const data = useQuery({ queryKey: key('order', id), queryFn: () => adminApi.order(id) });
  const [note, setNote] = useState('');
  const [carrier, setCarrier] = useState<string | null>(null);
  const [tracking, setTracking] = useState<string | null>(null);
  const [restock, setRestock] = useState(true);
  const [paymentNote, setPaymentNote] = useState('');
  const confirmPayment = useAdminMutation(() => adminApi.confirmPayment(id, paymentNote.trim()), () => setPaymentNote(''));
  const change = useAdminMutation((status: OrderStatus) =>
    adminApi.changeStatus(id, {
      status,
      note: note || null,
      ...(status === 'SHIPPED' ? { shippingCarrier: carrier ?? data.data?.order.shippingCarrier ?? null, trackingCode: tracking ?? data.data?.order.trackingCode ?? null } : {}),
      ...(status === 'RETURNED' ? { restock } : {}),
    }),
  () => setNote(''));
  const shipping = useAdminMutation(() =>
    adminApi.updateShipping(id, { shippingCarrier: carrier ?? data.data?.order.shippingCarrier ?? null, trackingCode: tracking ?? data.data?.order.trackingCode ?? null }),
  );

  if (data.isPending) return <LoadingState />;
  if (data.isError) return <Alert tone="danger">{errorMessage(data.error)}</Alert>;
  const { order, history, payments } = data.data;
  const actions = nextActions[order.status] ?? [];
  const err = change.error ?? shipping.error ?? confirmPayment.error;

  return (
    <div className={styles.page}>
      <PageHeader title={`Pedido ${order.number}`} description={`${dateTime(order.createdAt)} · ${sourceLabel[order.source]}`} actions={<StatusPill status={order.status} />} />
      {err ? <Alert tone="danger">{errorMessage(err)}</Alert> : null}
      <div className={styles.split}>
        <div className={styles.page}>
          <Panel title="Itens">
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Produto</th>
                  <th scope="col">SKU</th>
                  <th scope="col" className={styles.num}>Qtd.</th>
                  <th scope="col" className={styles.num}>Unitário</th>
                  <th scope="col" className={styles.num}>Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.productName} <span className={styles.muted}>{i.variantLabel}</span>
                    </td>
                    <td className={styles.code}>{i.sku}</td>
                    <td className={styles.num}>{i.quantity}</td>
                    <td className={styles.num}>{money(i.unitPrice)}</td>
                    <td className={styles.num}>{money(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className={styles.dl} style={{ marginTop: 'var(--space-4)' }}>
              <dt>Subtotal</dt>
              <dd>{money(order.subtotal)}</dd>
              <dt>Frete</dt>
              <dd>{money(order.shippingTotal)}</dd>
              <dt>Desconto</dt>
              <dd>{money(order.discountTotal)}</dd>
              <dt>Total</dt>
              <dd>
                <strong>{money(order.total)}</strong>
              </dd>
            </dl>
          </Panel>

          {order.status === 'PENDING_PAYMENT' && can('orders:write') && can('finance:write') ? (
            <Panel title="Recebeu o pagamento por fora?">
              <form
                className={styles.page}
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (paymentNote.trim().length < 3) return;
                  if (window.confirm(`Confirmar o pagamento de ${money(order.total)} do pedido ${order.number}? O pedido vai para "Pago" e a receita entra no financeiro.`)) confirmPayment.mutate(undefined);
                }}
              >
                <p className={styles.muted}>Use quando o cliente pagou por Pix direto, dinheiro ou maquininha, sem passar pelo Mercado Pago. Fica registrado quem confirmou.</p>
                <div className={styles.field}>
                  <label htmlFor="pay-note">Como foi pago (obrigatório)</label>
                  <input id="pay-note" maxLength={500} placeholder="Ex.: Pix recebido em 09/10, comprovante no WhatsApp" value={paymentNote} aria-invalid={confirmPayment.isError ? true : undefined} onChange={(e) => setPaymentNote(e.target.value)} />
                  {paymentNote.length > 0 && paymentNote.trim().length < 3 ? <p className={styles.fieldError}>Descreva como o pagamento foi recebido</p> : null}
                </div>
                <div>
                  <Button size="sm" type="submit" loading={confirmPayment.isPending} disabled={paymentNote.trim().length < 3}>
                    Confirmar pagamento
                  </Button>
                </div>
              </form>
            </Panel>
          ) : null}

          {can('orders:write') && actions.length ? (
            <Panel title="Próximo passo">
              <div className={styles.page}>
                {order.status === 'PAID' || order.status === 'PREPARING' ? (
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Transportadora</span>
                      <input maxLength={80} value={carrier ?? order.shippingCarrier ?? ''} onChange={(e) => setCarrier(e.target.value)} />
                    </label>
                    <label className={styles.field}>
                      <span>Código de rastreio</span>
                      <input maxLength={80} value={tracking ?? order.trackingCode ?? ''} onChange={(e) => setTracking(e.target.value)} />
                    </label>
                  </div>
                ) : null}
                {['SHIPPED', 'DELIVERED'].includes(order.status) ? (
                  <label className={styles.check}>
                    <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Na devolução, as peças voltam ao estoque (conferidas)
                  </label>
                ) : null}
                <label className={styles.field}>
                  <span>Observação (vai para o histórico)</span>
                  <input maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
                <div className={styles.actions}>
                  {actions.map((a) => (
                    <Button
                      key={a.status}
                      size="sm"
                      variant={a.danger ? 'danger' : 'primary'}
                      loading={change.isPending && change.variables === a.status}
                      onClick={() => {
                        if (!a.danger || window.confirm(`${a.label}? ${a.status === 'CANCELLED' ? 'O estoque será devolvido. Estorno de pagamento é feito no provedor.' : ''}`)) change.mutate(a.status);
                      }}
                    >
                      {a.label}
                    </Button>
                  ))}
                  {order.status === 'SHIPPED' ? (
                    <Button size="sm" variant="secondary" loading={shipping.isPending} onClick={() => shipping.mutate(undefined)}>
                      Salvar rastreio
                    </Button>
                  ) : null}
                </div>
                {order.status === 'PENDING_PAYMENT' ? (
                  <p className={styles.muted}>A aprovação do pagamento chega automaticamente pelo provedor. Sem pagamento até {dateTime(order.paymentExpiresAt)}, o pedido expira e o estoque volta.</p>
                ) : null}
              </div>
            </Panel>
          ) : null}

          <Panel title="Histórico">
            <ol className={styles.activity}>
              {history.map((h) => (
                <li key={h.id}>
                  <time dateTime={h.createdAt}>{dateTime(h.createdAt)}</time> · {h.fromStatus ? `${orderStatusText[h.fromStatus]} → ` : ''}
                  <strong>{orderStatusText[h.toStatus]}</strong> <span className={styles.muted}>({h.source})</span>
                  {h.note ? ` · ${h.note}` : ''}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className={styles.page}>
          <Panel title="Cliente">
            <dl className={styles.dl}>
              <dt>Nome</dt>
              <dd>
                <Link to={`/admin/clientes/${order.customerId}`}>{order.customerName}</Link>
              </dd>
              <dt>Telefone</dt>
              <dd>{order.customerPhone}</dd>
              <dt>E-mail</dt>
              <dd>{order.customerEmail ?? '—'}</dd>
            </dl>
          </Panel>
          <Panel title="Entrega">
            <p>
              {order.address.street}, {order.address.number}
              {order.address.complement ? ` – ${order.address.complement}` : ''}
              <br />
              {order.address.district} · {order.address.city}/{order.address.state}
              <br />
              CEP {order.address.zipCode.replace(/(\d{5})(\d{3})/, '$1-$2')}
            </p>
            {order.trackingCode ? (
              <p className={styles.muted}>
                {order.shippingCarrier} · <span className={styles.code}>{order.trackingCode}</span>
              </p>
            ) : null}
            {order.notes ? <p className={styles.muted}>Obs.: {order.notes}</p> : null}
          </Panel>
          <Panel title="Pagamentos">
            {payments.length ? (
              <ul className={styles.activity}>
                {payments.map((p) => (
                  <li key={p.id}>
                    <StatusPill status={p.status} label={p.status} /> {p.method === 'PIX' ? 'Pix' : 'Cartão'} · {money(p.amount)} · {p.provider}
                    {p.externalId ? <div className={styles.code}>id {p.externalId}</div> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>Nenhuma cobrança criada (provedor não configurado ou falha ao iniciar).</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Clientes ─────────────────────────

export function CustomersPage() {
  const key = useAdminKey();
  const { params, set, page } = usePageParam();
  const search = params.get('q') ?? undefined;
  const customers = useQuery({ queryKey: key('customers', search, page), queryFn: () => adminApi.customers({ search, page, pageSize: 25 }), placeholderData: keepPreviousData });
  return (
    <div className={styles.page}>
      <PageHeader title="Clientes" description="Criados automaticamente no checkout, identificados pelo telefone." />
      <form
        role="search"
        className={styles.toolbar}
        onSubmit={(e) => {
          e.preventDefault();
          set('q', String(new FormData(e.currentTarget).get('q') ?? '') || null);
        }}
      >
        <label className={styles.field}>
          <span>Nome, e-mail ou telefone</span>
          <input name="q" defaultValue={search} />
        </label>
        <Button size="sm" variant="secondary" type="submit">
          Buscar
        </Button>
      </form>
      <Panel>
        {customers.isPending ? (
          <LoadingState />
        ) : !customers.data?.items.length ? (
          <EmptyState title="Nenhum cliente" />
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">Contato</th>
                  <th scope="col" className={styles.num}>Pedidos pagos</th>
                  <th scope="col" className={styles.num}>Total comprado</th>
                  <th scope="col">Desde</th>
                </tr>
              </thead>
              <tbody>
                {customers.data.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/admin/clientes/${c.id}`} className={styles.rowLink}>
                        {c.name}
                      </Link>
                    </td>
                    <td>
                      {c.phone}
                      {c.email ? <div className={styles.muted}>{c.email}</div> : null}
                    </td>
                    <td className={styles.num}>{c.orderCount}</td>
                    <td className={styles.num}>{money(c.totalSpent)}</td>
                    <td>{date(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={customers.data.page} totalPages={customers.data.totalPages} onChange={(p) => set('pagina', String(p))} />
          </>
        )}
      </Panel>
    </div>
  );
}

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const key = useAdminKey();
  const data = useQuery({ queryKey: key('customer', id), queryFn: () => adminApi.customer(id) });
  if (data.isPending) return <LoadingState />;
  if (data.isError) return <Alert tone="danger">{errorMessage(data.error)}</Alert>;
  const { customer, orders } = data.data;
  return (
    <div className={styles.page}>
      <PageHeader title={customer.name} description={`${customer.phone}${customer.email ? ` · ${customer.email}` : ''}`} />
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Pedidos pagos</span>
          <strong className={styles.metricValue}>{customer.orderCount}</strong>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Total comprado</span>
          <strong className={styles.metricValue}>{money(customer.totalSpent)}</strong>
        </div>
      </div>
      <Panel title="Pedidos">
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Pedido</th>
              <th scope="col">Data</th>
              <th scope="col">Status</th>
              <th scope="col" className={styles.num}>Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link to={`/admin/pedidos/${o.id}`} className={styles.code}>
                    {o.number}
                  </Link>
                </td>
                <td>{dateTime(o.createdAt)}</td>
                <td>
                  <StatusPill status={o.status} />
                </td>
                <td className={styles.num}>{money(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ───────────────────────── Financeiro ─────────────────────────

function monthRange(offset = 0) {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
  return { from: from.toISOString(), to: to.toISOString(), label: from.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
}

/** Duas barras proporcionais: quanto entrou e quanto saiu no período. */
function FlowBars({ income, expense }: { income: number; expense: number }) {
  const max = Math.max(income, expense, 1);
  return (
    <div className={styles.flow}>
      <div className={styles.flowRow}>
        <span>Entradas</span>
        <span className={styles.flowTrack}>
          <span className={styles.flowIn} style={{ width: `${(income / max) * 100}%` }} />
        </span>
        <strong className={styles.positive}>{money(income)}</strong>
      </div>
      <div className={styles.flowRow}>
        <span>Saídas</span>
        <span className={styles.flowTrack}>
          <span className={styles.flowOut} style={{ width: `${(expense / max) * 100}%` }} />
        </span>
        <strong className={styles.negative}>{money(expense)}</strong>
      </div>
    </div>
  );
}

export function FinancePage() {
  const key = useAdminKey();
  const [offset, setOffset] = useState(0);
  const range = monthRange(offset);
  const summary = useQuery({ queryKey: key('finance-summary', range.from), queryFn: () => adminApi.financeSummary({ from: range.from, to: range.to }) });
  const s = summary.data;
  return (
    <div className={styles.page}>
      <PageHeader
        title="Financeiro"
        description={`Período: ${range.label}`}
        actions={
          <>
            <button type="button" className={styles.linkButton} onClick={() => setOffset((o) => o - 1)}>
              Mês anterior
            </button>
            <button type="button" className={styles.linkButton} disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)}>
              Próximo mês
            </button>
            <Link to="/admin/financeiro/receitas" className={styles.linkButton}>
              Receitas
            </Link>
            <Link to="/admin/financeiro/despesas" className={styles.linkButton}>
              Despesas
            </Link>
          </>
        }
      />
      {summary.isPending ? (
        <LoadingState />
      ) : summary.isError ? (
        <Alert tone="danger">{errorMessage(summary.error)}</Alert>
      ) : s ? (
        <>
          {s.cashResult < 0 ? (
            <Callout tone="danger">
              Saídas maiores que as entradas neste período: resultado de caixa de <strong>{money(s.cashResult)}</strong>.
            </Callout>
          ) : null}
          {s.expensesByCompetence > s.expensesPaid ? (
            <Callout tone="warn" action={<Link to="/admin/financeiro/despesas?status=PENDING" className={styles.linkButton}>Ver despesas</Link>}>
              <strong>{money(s.expensesByCompetence - s.expensesPaid)}</strong> em despesas deste período ainda não foram pagas.
            </Callout>
          ) : null}
          <section className={styles.kpis} aria-label="Resultado">
            <Kpi label="Recebido" value={money(s.received)} icon={WalletIcon} tone="success" hint="Receitas pagas, por data de recebimento" to="/admin/financeiro/receitas" />
            <Kpi label="Despesas pagas" value={money(s.expensesPaid)} icon={WalletIcon} tone={s.expensesPaid ? 'danger' : 'neutral'} hint="Por data de pagamento" to="/admin/financeiro/despesas" />
            <Kpi
              label="Resultado de caixa"
              value={money(s.cashResult)}
              icon={ChartIcon}
              tone={s.cashResult > 0 ? 'success' : s.cashResult < 0 ? 'danger' : 'neutral'}
              hint="Recebido − despesas pagas. Não é lucro contábil."
            />
          </section>
          <section className={styles.kpis} aria-label="Vendas">
            <Kpi label="Vendas aprovadas" value={money(s.salesApproved.total)} icon={ChartIcon} tone="accent" hint={`${s.salesApproved.count} pagamentos aprovados no período`} />
            <Kpi label="Pedidos criados" value={money(s.ordersCreated.total)} icon={OrdersIcon} hint={`${s.ordersCreated.count} pedidos, qualquer status`} to="/admin/pedidos" />
            <Kpi label="Despesas do período" value={money(s.expensesByCompetence)} icon={WalletIcon} hint="Por competência (pagas ou não)" />
          </section>
          <Panel title="Entradas x saídas">
            <FlowBars income={s.received} expense={s.expensesPaid} />
          </Panel>
          <Panel title="Como ler estes números">
            <ul className={styles.activity}>
              <li>Pedido criado não é venda: só conta como venda quando o provedor aprova o pagamento.</li>
              <li>Recebido considera a data em que o dinheiro entrou; webhooks repetidos não duplicam a receita.</li>
              <li>Resultado de caixa não desconta custo das peças, impostos nem tarifas do provedor.</li>
            </ul>
          </Panel>
        </>
      ) : null}
    </div>
  );
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data');
const entrySchema = z
  .object({
    description: z.string().trim().min(2, 'Mínimo de 2 caracteres').max(200, 'Máximo de 200 caracteres'),
    amount: z.number({ error: 'Informe o valor' }).int().positive('O valor deve ser maior que zero').max(999_999_999_999, 'Valor muito alto').nullable(),
    categoryId: z.string(),
    competenceDate: isoDay,
    paid: z.boolean(),
    paidAt: z.string(),
    paymentMethod: z.string().trim().max(40, 'Máximo de 40 caracteres'),
  })
  .superRefine((v, ctx) => {
    if (v.amount == null) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Informe o valor' });
    if (v.paid && !/^\d{4}-\d{2}-\d{2}$/.test(v.paidAt)) ctx.addIssue({ code: 'custom', path: ['paidAt'], message: 'Informe a data do pagamento' });
  });
type EntryForm = z.infer<typeof entrySchema>;

export function EntriesPage({ kind }: { kind: 'INCOME' | 'EXPENSE' }) {
  const key = useAdminKey();
  const { can } = useAdminSession();
  const { params, set, page } = usePageParam();
  const status = (params.get('status') as Transaction['status'] | null) ?? undefined;
  const list = useQuery({ queryKey: key('transactions', kind, status, page), queryFn: () => adminApi.transactions({ kind, status, page, pageSize: 25 }), placeholderData: keepPreviousData });
  const categories = useQuery({ queryKey: key('finance-categories'), queryFn: adminApi.financeCategories });
  const today = new Date().toISOString().slice(0, 10);
  const blank: EntryForm = { description: '', amount: null, categoryId: '', competenceDate: today, paid: true, paidAt: today, paymentMethod: '' };
  const form = useForm<EntryForm>({ resolver: zodResolver(entrySchema), defaultValues: blank });
  const fe = form.formState.errors;
  const paid = form.watch('paid');
  // A chave remonta o campo de valor (que guarda o texto digitado) depois de salvar.
  const [formKey, setFormKey] = useState(0);
  const create = useAdminMutation(
    (v: EntryForm) =>
      adminApi.createEntry(kind, {
        description: v.description,
        amount: v.amount ?? 0,
        categoryId: v.categoryId || null,
        competenceDate: v.competenceDate,
        paidAt: v.paid ? new Date(`${v.paidAt}T12:00:00Z`).toISOString() : null,
        paymentMethod: v.paymentMethod || null,
      }),
    () => {
      form.reset({ ...form.getValues(), description: '', amount: null });
      setFormKey((k) => k + 1);
    },
  );
  const mark = useAdminMutation((v: { id: string; status: Transaction['status'] }) =>
    adminApi.updateTransaction(v.id, { status: v.status, ...(v.status === 'PAID' ? { paidAt: new Date().toISOString() } : {}) }),
  );
  const title = kind === 'INCOME' ? 'Receitas' : 'Despesas';
  const err = create.error ?? mark.error;

  return (
    <div className={styles.page}>
      <PageHeader
        title={title}
        description={kind === 'INCOME' ? 'Receitas de pedidos entram automaticamente na aprovação do pagamento. Aqui também ficam receitas avulsas.' : 'Fornecedores, frete, marketing, tarifas e demais custos.'}
        actions={<Link to="/admin/financeiro" className={styles.linkButton}>Resumo</Link>}
      />
      {err ? <Alert tone="danger">{errorMessage(err)}</Alert> : null}
      {can('finance:write') ? (
        <Panel title={kind === 'INCOME' ? 'Nova receita avulsa' : 'Nova despesa'}>
          <form className={styles.formGrid} noValidate onSubmit={form.handleSubmit((v) => create.mutate(v))}>
            <div className={styles.field}>
              <label htmlFor="en-desc">Descrição</label>
              <input id="en-desc" aria-invalid={fe.description ? true : undefined} {...form.register('description')} />
              {fe.description ? <p className={styles.fieldError}>{fe.description.message}</p> : null}
            </div>
            <Controller
              control={form.control}
              name="amount"
              render={({ field }) => <MoneyField key={formKey} label="Valor" value={field.value} onChange={field.onChange} error={fe.amount?.message} />}
            />
            <div className={styles.field}>
              <label htmlFor="en-cat">Categoria</label>
              <select id="en-cat" {...form.register('categoryId')}>
                <option value="">Sem categoria</option>
                {categories.data?.items
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="en-comp">Competência</label>
              <input id="en-comp" type="date" aria-invalid={fe.competenceDate ? true : undefined} {...form.register('competenceDate')} />
              {fe.competenceDate ? <p className={styles.fieldError}>{fe.competenceDate.message}</p> : null}
            </div>
            <label className={styles.check}>
              <input type="checkbox" {...form.register('paid')} /> {kind === 'INCOME' ? 'Já recebida' : 'Já paga'}
            </label>
            {paid ? (
              <div className={styles.field}>
                <label htmlFor="en-paid">{kind === 'INCOME' ? 'Recebida em' : 'Paga em'}</label>
                <input id="en-paid" type="date" aria-invalid={fe.paidAt ? true : undefined} {...form.register('paidAt')} />
                {fe.paidAt ? <p className={styles.fieldError}>{fe.paidAt.message}</p> : null}
              </div>
            ) : null}
            <div className={styles.field}>
              <label htmlFor="en-method">Forma de pagamento</label>
              <input id="en-method" placeholder="Pix, boleto, cartão…" aria-invalid={fe.paymentMethod ? true : undefined} {...form.register('paymentMethod')} />
              {fe.paymentMethod ? <p className={styles.fieldError}>{fe.paymentMethod.message}</p> : null}
            </div>
            <div>
              <Button size="sm" type="submit" loading={create.isPending}>
                Registrar
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}
      <div className={styles.toolbar}>
        <label className={styles.field}>
          <span>Status</span>
          <select value={status ?? ''} onChange={(e) => set('status', e.target.value || null)}>
            <option value="">Todos</option>
            <option value="PENDING">Pendente</option>
            <option value="PAID">{kind === 'INCOME' ? 'Recebida' : 'Paga'}</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </label>
      </div>
      <Panel>
        {list.isPending ? (
          <LoadingState />
        ) : !list.data?.items.length ? (
          <EmptyState title={`Nenhuma ${kind === 'INCOME' ? 'receita' : 'despesa'}`} />
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Competência</th>
                  <th scope="col">Descrição</th>
                  <th scope="col">Categoria</th>
                  <th scope="col">Situação</th>
                  <th scope="col" className={styles.num}>Valor</th>
                  <th scope="col"><span className="visually-hidden">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((t) => (
                  <tr key={t.id}>
                    <td>{date(t.competenceDate)}</td>
                    <td>
                      {t.orderId ? <Link to={`/admin/pedidos/${t.orderId}`}>{t.description}</Link> : t.description}
                    </td>
                    <td>{t.categoryName ?? '—'}</td>
                    <td>
                      {t.status === 'PAID' ? (
                        <span className={`${styles.pill} ${styles.pill_ok}`}>{`${kind === 'INCOME' ? 'Recebida' : 'Paga'} em ${date(t.paidAt)}`}</span>
                      ) : t.status === 'PENDING' ? (
                        <span className={`${styles.pill} ${styles.pill_warn}`}>Pendente</span>
                      ) : (
                        <span className={`${styles.pill} ${styles.pill_bad}`}>Cancelada</span>
                      )}
                    </td>
                    <td className={`${styles.num} ${t.status === 'CANCELLED' ? styles.muted : kind === 'INCOME' ? styles.positive : styles.negative}`}>
                      <strong>{money(t.amount)}</strong>
                    </td>
                    <td>
                      {can('finance:write') && !t.paymentId ? (
                        <div className={styles.actions}>
                          {t.status === 'PENDING' ? (
                            <button type="button" className={styles.linkButton} onClick={() => mark.mutate({ id: t.id, status: 'PAID' })}>
                              {kind === 'INCOME' ? 'Recebida' : 'Paga'}
                            </button>
                          ) : null}
                          {t.status !== 'CANCELLED' ? (
                            <button type="button" className={styles.linkButton} onClick={() => window.confirm('Cancelar este lançamento?') && mark.mutate({ id: t.id, status: 'CANCELLED' })}>
                              Cancelar
                            </button>
                          ) : null}
                        </div>
                      ) : t.paymentId ? (
                        <span className={styles.muted}>via provedor</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={list.data.page} totalPages={list.data.totalPages} onChange={(p) => set('pagina', String(p))} />
          </>
        )}
      </Panel>
    </div>
  );
}

export function ReportsPage() {
  const key = useAdminKey();
  const year = new Date().getUTCFullYear();
  const [selected, setSelected] = useState(year);
  const range = { from: new Date(Date.UTC(selected, 0, 1)).toISOString(), to: new Date(Date.UTC(selected + 1, 0, 1)).toISOString() };
  const cashflow = useQuery({ queryKey: key('cashflow', selected), queryFn: () => adminApi.cashflow({ ...range, groupBy: 'month' }) });
  const summary = useQuery({ queryKey: key('finance-summary', range.from, 'year'), queryFn: () => adminApi.financeSummary(range) });
  const max = Math.max(1, ...(cashflow.data?.items.flatMap((i) => [i.income, i.expense]) ?? [1]));

  return (
    <div className={styles.page}>
      <PageHeader
        title="Relatórios"
        description="Fluxo de caixa mensal (lançamentos pagos)."
        actions={
          <label className={styles.field}>
            <span className="visually-hidden">Ano</span>
            <select value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
              {[year, year - 1, year - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        }
      />
      {summary.data ? (
        <section className={styles.kpis} aria-label="Ano">
          <Kpi label="Vendas aprovadas no ano" value={money(summary.data.salesApproved.total)} icon={ChartIcon} tone="accent" hint={`${summary.data.salesApproved.count} pagamentos`} />
          <Kpi label="Recebido" value={money(summary.data.received)} icon={WalletIcon} tone="success" />
          <Kpi label="Despesas pagas" value={money(summary.data.expensesPaid)} icon={WalletIcon} tone={summary.data.expensesPaid ? 'danger' : 'neutral'} />
          <Kpi
            label="Resultado de caixa"
            value={money(summary.data.cashResult)}
            icon={ChartIcon}
            tone={summary.data.cashResult > 0 ? 'success' : summary.data.cashResult < 0 ? 'danger' : 'neutral'}
          />
        </section>
      ) : null}
      <Panel title="Mês a mês">
        {cashflow.isPending ? (
          <LoadingState />
        ) : !cashflow.data?.items.length ? (
          <EmptyState title="Sem lançamentos pagos neste ano" />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Mês</th>
                <th scope="col" className={styles.num}>Entradas</th>
                <th scope="col" className={styles.num}>Saídas</th>
                <th scope="col" className={styles.num}>Saldo</th>
                <th scope="col"><span className="visually-hidden">Gráfico</span></th>
              </tr>
            </thead>
            <tbody>
              {cashflow.data.items.map((r) => (
                <tr key={r.period}>
                  <td>{new Date(`${r.period}-01T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' })}</td>
                  <td className={`${styles.num} ${styles.positive}`}>{money(r.income)}</td>
                  <td className={`${styles.num} ${styles.negative}`}>{money(r.expense)}</td>
                  <td className={styles.num}>
                    <strong className={r.income - r.expense >= 0 ? styles.positive : styles.negative}>{money(r.income - r.expense)}</strong>
                  </td>
                  <td aria-hidden="true" style={{ minWidth: 160 }}>
                    <div style={{ height: 6, width: `${(r.income / max) * 100}%`, background: 'var(--color-success)', borderRadius: 3 }} />
                    <div style={{ height: 6, marginTop: 3, width: `${(r.expense / max) * 100}%`, background: 'var(--color-danger)', borderRadius: 3 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

// ───────────────────────── Configurações ─────────────────────────

export function SettingsPage() {
  const key = useAdminKey();
  const { can } = useAdminSession();
  const settings = useQuery({ queryKey: key('settings'), queryFn: adminApi.settings });
  const members = useQuery({ queryKey: key('members'), queryFn: adminApi.members, enabled: can('members:manage') });
  if (settings.isPending) return <LoadingState />;
  if (settings.isError) return <Alert tone="danger">{errorMessage(settings.error)}</Alert>;
  return (
    <div className={styles.page}>
      <PageHeader title="Configurações" description="Regras comerciais desta loja." />
      <SettingsForm initial={settings.data} readOnly={!can('settings:write')} />
      <PasswordPanel />
      {members.data ? <TeamPanel members={members.data.items} /> : null}
    </div>
  );
}

const settingsSchema = z
  .object({
    shippingMode: z.enum(['FLAT_RATE', 'FREE']),
    shippingFlatRate: centsSchema,
    freeShippingThreshold: centsSchema.nullable(),
    pendingPaymentTtlMinutes: z.number({ error: 'Informe um número' }).int('Use minutos inteiros').min(10, 'Mínimo de 10 minutos').max(10_080, 'Máximo de 7 dias (10.080 min)'),
    lowStockThreshold: z.number({ error: 'Informe um número' }).int('Use um número inteiro').min(0, 'Não pode ser negativo').max(1000, 'Máximo de 1.000'),
    orderNumberPrefix: z.string().trim().max(8, 'Máximo de 8 caracteres').regex(/^[A-Za-z0-9-]*$/, 'Letras, números e hífen'),
    contactEmail: z.union([z.literal(''), emailSchema]),
    contactPhone: z.union([z.literal(''), phoneSchema]),
    termsUrl: z.union([z.literal(''), z.url({ protocol: /^https?$/, error: 'Use um endereço http(s) válido' }).max(2_000)]),
  });
type SettingsFormIn = z.input<typeof settingsSchema>;
type SettingsFormOut = z.output<typeof settingsSchema>;

function SettingsForm({ initial, readOnly }: { initial: Settings; readOnly: boolean }) {
  const form = useForm<SettingsFormIn, unknown, SettingsFormOut>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      shippingMode: initial.shippingMode,
      shippingFlatRate: initial.shippingFlatRate,
      freeShippingThreshold: initial.freeShippingThreshold,
      pendingPaymentTtlMinutes: initial.pendingPaymentTtlMinutes,
      lowStockThreshold: initial.lowStockThreshold,
      orderNumberPrefix: initial.orderNumberPrefix,
      contactEmail: initial.contactEmail ?? '',
      contactPhone: initial.contactPhone ?? '',
      termsUrl: initial.termsUrl ?? '',
    },
  });
  const e = form.formState.errors;
  const mode = form.watch('shippingMode');
  const save = useAdminMutation((v: SettingsFormOut) =>
    adminApi.updateSettings({
      ...v,
      contactEmail: v.contactEmail || null,
      contactPhone: v.contactPhone || null,
      termsUrl: v.termsUrl || null,
      orderNumberPrefix: v.orderNumberPrefix.toUpperCase(),
    }),
  );
  return (
    <Panel title="Vendas e entrega">
      {save.isError ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
      {save.isSuccess ? <Alert tone="success">Configurações salvas.</Alert> : null}
      <form noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))}>
        <fieldset disabled={readOnly} className={styles.formGrid} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className={styles.field}>
            <label htmlFor="st-ship">Frete</label>
            <select id="st-ship" {...form.register('shippingMode')}>
              <option value="FLAT_RATE">Valor fixo</option>
              <option value="FREE">Sempre grátis</option>
            </select>
          </div>
          {mode === 'FLAT_RATE' ? (
            <>
              <Controller control={form.control} name="shippingFlatRate" render={({ field }) => <MoneyField label="Valor do frete" value={field.value} onChange={(v) => field.onChange(v ?? 0)} error={e.shippingFlatRate?.message} />} />
              <Controller control={form.control} name="freeShippingThreshold" render={({ field }) => <MoneyField label="Frete grátis acima de (opcional)" optional value={field.value} onChange={field.onChange} error={e.freeShippingThreshold?.message} />} />
            </>
          ) : null}
          <div className={styles.field}>
            <label htmlFor="st-ttl">Prazo para pagamento (minutos)</label>
            <input id="st-ttl" type="number" inputMode="numeric" min={10} max={10080} step={1} aria-invalid={e.pendingPaymentTtlMinutes ? true : undefined} {...form.register('pendingPaymentTtlMinutes', intInput)} />
            {e.pendingPaymentTtlMinutes ? <p className={styles.fieldError}>{e.pendingPaymentTtlMinutes.message}</p> : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="st-low">Alerta de estoque baixo (unidades)</label>
            <input id="st-low" type="number" inputMode="numeric" min={0} max={1000} step={1} aria-invalid={e.lowStockThreshold ? true : undefined} {...form.register('lowStockThreshold', intInput)} />
            {e.lowStockThreshold ? <p className={styles.fieldError}>{e.lowStockThreshold.message}</p> : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="st-prefix">Prefixo do número do pedido</label>
            <input id="st-prefix" maxLength={8} autoCapitalize="characters" aria-invalid={e.orderNumberPrefix ? true : undefined} {...form.register('orderNumberPrefix')} />
            {e.orderNumberPrefix ? <p className={styles.fieldError}>{e.orderNumberPrefix.message}</p> : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="st-email">E-mail de contato</label>
            <input id="st-email" type="email" inputMode="email" autoComplete="email" aria-invalid={e.contactEmail ? true : undefined} {...form.register('contactEmail')} />
            {e.contactEmail ? <p className={styles.fieldError}>{e.contactEmail.message}</p> : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="st-phone">Telefone / WhatsApp</label>
            <input id="st-phone" type="tel" inputMode="tel" autoComplete="tel" aria-invalid={e.contactPhone ? true : undefined} {...form.register('contactPhone')} />
            {e.contactPhone ? <p className={styles.fieldError}>{e.contactPhone.message}</p> : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="st-terms">URL dos termos oficiais (opcional)</label>
            <input id="st-terms" type="url" inputMode="url" aria-invalid={e.termsUrl ? true : undefined} {...form.register('termsUrl')} />
            {e.termsUrl ? <p className={styles.fieldError}>{e.termsUrl.message}</p> : null}
          </div>
          {!readOnly ? (
            <div className={styles.span2}>
              <Button size="sm" type="submit" loading={save.isPending}>
                Salvar
              </Button>
            </div>
          ) : null}
        </fieldset>
      </form>
    </Panel>
  );
}

const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual').max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'As senhas não conferem' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'Use uma senha diferente da atual' });
type PasswordForm = z.infer<typeof passwordFormSchema>;

/** Troca da própria senha. A API revoga as outras sessões e devolve uma nova. */
function PasswordPanel() {
  const form = useForm<PasswordForm>({ resolver: zodResolver(passwordFormSchema), defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } });
  const e = form.formState.errors;
  const change = useMutation({
    mutationFn: (v: PasswordForm) => api<LoginResponse>('/auth/password', { method: 'POST', body: v, admin: true }),
    onSuccess: (res) => {
      session.set(res.accessToken);
      form.reset();
    },
    onError: (error) => {
      const issues = error instanceof ApiError ? (error.details as { issues?: { path: string; message: string }[] } | undefined)?.issues : undefined;
      issues?.forEach((i) => {
        if (i.path === 'currentPassword' || i.path === 'newPassword' || i.path === 'confirmPassword') form.setError(i.path, { message: i.message });
      });
    },
  });
  return (
    <Panel title="Sua senha">
      {change.isSuccess ? <Alert tone="success">Senha alterada. As outras sessões foram encerradas.</Alert> : null}
      {change.isError && !(change.error instanceof ApiError && change.error.code === 'VALIDATION_ERROR') ? <Alert tone="danger">{errorMessage(change.error)}</Alert> : null}
      <form className={styles.formGrid} noValidate onSubmit={form.handleSubmit((v) => change.mutate(v))}>
        <div className={`${styles.field} ${styles.span2}`}>
          <label htmlFor="pw-current">Senha atual</label>
          <input id="pw-current" type="password" autoComplete="current-password" aria-invalid={e.currentPassword ? true : undefined} {...form.register('currentPassword')} />
          {e.currentPassword ? <p className={styles.fieldError}>{e.currentPassword.message}</p> : null}
        </div>
        <div className={styles.field}>
          <label htmlFor="pw-new">Nova senha</label>
          <input id="pw-new" type="password" autoComplete="new-password" aria-describedby="pw-hint" aria-invalid={e.newPassword ? true : undefined} {...form.register('newPassword')} />
          {e.newPassword ? <p className={styles.fieldError}>{e.newPassword.message}</p> : <p id="pw-hint" className={styles.muted}>12 ou mais caracteres, com letras e números.</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor="pw-confirm">Confirme a nova senha</label>
          <input id="pw-confirm" type="password" autoComplete="new-password" aria-invalid={e.confirmPassword ? true : undefined} {...form.register('confirmPassword')} />
          {e.confirmPassword ? <p className={styles.fieldError}>{e.confirmPassword.message}</p> : null}
        </div>
        <div className={styles.span2}>
          <Button size="sm" type="submit" loading={change.isPending}>
            Alterar senha
          </Button>
        </div>
      </form>
    </Panel>
  );
}
