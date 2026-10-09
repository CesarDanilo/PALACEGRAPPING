import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import { adminApi, type AdminOrder, type Settings, type Transaction } from '@/lib/api/admin';
import type { OrderStatus } from '@/lib/api/types';
import { MoneyField, PageHeader, Pager, Panel, StatusPill, date, dateTime, errorMessage, money, orderStatusText, useAdminKey, useAdminMutation } from './common';
import styles from './admin.module.css';

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
  const err = change.error ?? shipping.error;

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

          {can('orders:write') && actions.length ? (
            <Panel title="Próximo passo">
              <div className={styles.page}>
                {order.status === 'PAID' || order.status === 'PREPARING' ? (
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Transportadora</span>
                      <input value={carrier ?? order.shippingCarrier ?? ''} onChange={(e) => setCarrier(e.target.value)} />
                    </label>
                    <label className={styles.field}>
                      <span>Código de rastreio</span>
                      <input value={tracking ?? order.trackingCode ?? ''} onChange={(e) => setTracking(e.target.value)} />
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
                  <input value={note} onChange={(e) => setNote(e.target.value)} />
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
          <section className={styles.metrics} aria-label="Indicadores">
            {[
              ['Pedidos criados', money(s.ordersCreated.total), `${s.ordersCreated.count} pedidos, qualquer status`],
              ['Vendas aprovadas', money(s.salesApproved.total), `${s.salesApproved.count} pagamentos aprovados no período`],
              ['Recebido', money(s.received), 'Receitas pagas, por data de recebimento'],
              ['Despesas pagas', money(s.expensesPaid), 'Por data de pagamento'],
              ['Despesas do período', money(s.expensesByCompetence), 'Por competência (pagas ou não)'],
              ['Resultado de caixa', money(s.cashResult), 'Recebido − despesas pagas. Não é lucro contábil.'],
            ].map(([label, value, hint]) => (
              <div key={label} className={styles.metric}>
                <span className={styles.metricLabel}>{label}</span>
                <strong className={styles.metricValue}>{value}</strong>
                <span className={styles.metricHint}>{hint}</span>
              </div>
            ))}
          </section>
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

export function EntriesPage({ kind }: { kind: 'INCOME' | 'EXPENSE' }) {
  const key = useAdminKey();
  const { can } = useAdminSession();
  const { params, set, page } = usePageParam();
  const status = (params.get('status') as Transaction['status'] | null) ?? undefined;
  const list = useQuery({ queryKey: key('transactions', kind, status, page), queryFn: () => adminApi.transactions({ kind, status, page, pageSize: 25 }), placeholderData: keepPreviousData });
  const categories = useQuery({ queryKey: key('finance-categories'), queryFn: adminApi.financeCategories });
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ description: '', amount: null as number | null, categoryId: '', competenceDate: today, paid: true, paidAt: today, paymentMethod: '' });
  const [formKey, setFormKey] = useState(0);
  const create = useAdminMutation(
    () =>
      adminApi.createEntry(kind, {
        description: form.description,
        amount: form.amount ?? 0,
        categoryId: form.categoryId || null,
        competenceDate: form.competenceDate,
        paidAt: form.paid ? new Date(`${form.paidAt}T12:00:00Z`).toISOString() : null,
        paymentMethod: form.paymentMethod || null,
      }),
    () => {
      setForm((f) => ({ ...f, description: '', amount: null }));
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
          <form
            key={formKey}
            className={styles.formGrid}
            onSubmit={(e) => {
              e.preventDefault();
              if (form.amount && form.amount > 0) create.mutate(undefined);
            }}
          >
            <label className={styles.field}>
              <span>Descrição</span>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required minLength={2} />
            </label>
            <MoneyField label="Valor" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} required />
            <label className={styles.field}>
              <span>Categoria</span>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Sem categoria</option>
                {categories.data?.items
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Competência</span>
              <input type="date" value={form.competenceDate} onChange={(e) => setForm({ ...form, competenceDate: e.target.value })} required />
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} /> {kind === 'INCOME' ? 'Já recebida' : 'Já paga'}
            </label>
            {form.paid ? (
              <label className={styles.field}>
                <span>{kind === 'INCOME' ? 'Recebida em' : 'Paga em'}</span>
                <input type="date" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} required />
              </label>
            ) : null}
            <label className={styles.field}>
              <span>Forma de pagamento</span>
              <input value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} placeholder="Pix, boleto, cartão…" />
            </label>
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
                      {t.status === 'PAID' ? `${kind === 'INCOME' ? 'Recebida' : 'Paga'} em ${date(t.paidAt)}` : t.status === 'PENDING' ? 'Pendente' : 'Cancelada'}
                    </td>
                    <td className={styles.num}>{money(t.amount)}</td>
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
        <section className={styles.metrics} aria-label="Ano">
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Vendas aprovadas no ano</span>
            <strong className={styles.metricValue}>{money(summary.data.salesApproved.total)}</strong>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Recebido</span>
            <strong className={styles.metricValue}>{money(summary.data.received)}</strong>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Despesas pagas</span>
            <strong className={styles.metricValue}>{money(summary.data.expensesPaid)}</strong>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Resultado de caixa</span>
            <strong className={styles.metricValue}>{money(summary.data.cashResult)}</strong>
          </div>
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
                  <td className={styles.num}>{money(r.income)}</td>
                  <td className={styles.num}>{money(r.expense)}</td>
                  <td className={styles.num}>{money(r.income - r.expense)}</td>
                  <td aria-hidden="true" style={{ minWidth: 160 }}>
                    <div style={{ height: 6, width: `${(r.income / max) * 100}%`, background: 'var(--accent)' }} />
                    <div style={{ height: 6, marginTop: 2, width: `${(r.expense / max) * 100}%`, background: 'var(--color-graphite-400)' }} />
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
      {members.data ? (
        <Panel title="Equipe">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">E-mail</th>
                <th scope="col">Papel</th>
              </tr>
            </thead>
            <tbody>
              {members.data.items.map((m) => (
                <tr key={m.userId}>
                  <td>{m.name}</td>
                  <td>{m.email}</td>
                  <td>{m.role === 'OWNER' ? 'Proprietário' : m.role === 'ADMIN' ? 'Administrador' : 'Operador'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.muted}>Convites e alteração de papéis estão disponíveis na API (/tenants/current/members).</p>
        </Panel>
      ) : null}
    </div>
  );
}

function SettingsForm({ initial, readOnly }: { initial: Settings; readOnly: boolean }) {
  const [form, setForm] = useState(initial);
  const save = useAdminMutation(() =>
    adminApi.updateSettings({
      ...form,
      contactEmail: form.contactEmail || null,
      contactPhone: form.contactPhone || null,
      termsUrl: form.termsUrl || null,
      orderNumberPrefix: form.orderNumberPrefix.toUpperCase(),
    }),
  );
  return (
    <Panel title="Vendas e entrega">
      {save.isError ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
      {save.isSuccess ? <Alert tone="success">Configurações salvas.</Alert> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(undefined);
        }}
      >
        <fieldset disabled={readOnly} className={styles.formGrid} style={{ border: 0, padding: 0, margin: 0 }}>
          <label className={styles.field}>
            <span>Frete</span>
            <select value={form.shippingMode} onChange={(e) => setForm({ ...form, shippingMode: e.target.value as Settings['shippingMode'] })}>
              <option value="FLAT_RATE">Valor fixo</option>
              <option value="FREE">Sempre grátis</option>
            </select>
          </label>
          {form.shippingMode === 'FLAT_RATE' ? (
            <>
              <MoneyField label="Valor do frete" value={form.shippingFlatRate} onChange={(v) => setForm({ ...form, shippingFlatRate: v ?? 0 })} />
              <MoneyField label="Frete grátis acima de (opcional)" optional value={form.freeShippingThreshold} onChange={(v) => setForm({ ...form, freeShippingThreshold: v })} />
            </>
          ) : null}
          <label className={styles.field}>
            <span>Prazo para pagamento (minutos)</span>
            <input type="number" min={10} max={10080} value={form.pendingPaymentTtlMinutes} onChange={(e) => setForm({ ...form, pendingPaymentTtlMinutes: Number(e.target.value) })} />
          </label>
          <label className={styles.field}>
            <span>Alerta de estoque baixo (unidades)</span>
            <input type="number" min={0} value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: Number(e.target.value) })} />
          </label>
          <label className={styles.field}>
            <span>Prefixo do número do pedido</span>
            <input maxLength={8} value={form.orderNumberPrefix} onChange={(e) => setForm({ ...form, orderNumberPrefix: e.target.value.replace(/[^A-Za-z0-9-]/g, '') })} />
          </label>
          <label className={styles.field}>
            <span>E-mail de contato</span>
            <input type="email" value={form.contactEmail ?? ''} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span>Telefone / WhatsApp</span>
            <input value={form.contactPhone ?? ''} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span>URL dos termos oficiais (opcional)</span>
            <input type="url" value={form.termsUrl ?? ''} onChange={(e) => setForm({ ...form, termsUrl: e.target.value })} />
          </label>
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
