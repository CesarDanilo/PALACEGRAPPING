import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Alert, LoadingState } from '@/components/ui/Feedback';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import { api } from '@/lib/api/client';
import type { Dashboard } from '@/lib/api/types';
import { formatMoney } from '@/lib/money';
import styles from './admin.module.css';

const statusLabel: Record<string, string> = {
  PENDING_PAYMENT: 'aguardando pagamento',
  PAID: 'pago',
  PREPARING: 'em preparação',
  SHIPPED: 'enviado',
  DELIVERED: 'entregue',
  CANCELLED: 'cancelado',
  EXPIRED: 'expirado',
  RETURNED: 'devolvido',
};

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
      {hint ? <span className={styles.metricHint}>{hint}</span> : null}
    </div>
  );
}

export function DashboardPage() {
  const { membership } = useAdminSession();
  const dashboard = useQuery({
    queryKey: ['admin', membership?.tenant.id, 'dashboard'],
    queryFn: () => api<Dashboard>('/dashboard', { admin: true }),
  });

  if (dashboard.isPending) return <LoadingState />;
  if (dashboard.isError) return <Alert tone="danger">Não foi possível carregar o painel.</Alert>;
  const d = dashboard.data;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Painel</h1>
        <p className={styles.muted}>Mês corrente</p>
      </header>

      <section aria-label="Operação" className={styles.metrics}>
        <Metric label="Aguardando pagamento" value={String(d.pendingOrders)} />
        <Metric label="Para separar e enviar" value={String(d.toFulfil)} />
        <Metric label="Cobranças pendentes" value={String(d.awaitingPayments)} />
        <Metric label="Estoque baixo" value={String(d.lowStock.length)} />
      </section>

      {d.finance ? (
        <section aria-label="Financeiro" className={styles.metrics}>
          <Metric label="Pedidos criados" value={formatMoney(d.finance.ordersCreated.total)} hint={`${d.finance.ordersCreated.count} pedidos, qualquer status`} />
          <Metric label="Vendas aprovadas" value={formatMoney(d.finance.salesApproved.total)} hint={`${d.finance.salesApproved.count} pagamentos aprovados`} />
          <Metric label="Recebido" value={formatMoney(d.finance.received)} hint="Receitas com data de recebimento no período" />
          <Metric label="Despesas pagas" value={formatMoney(d.finance.expensesPaid)} />
          <Metric label="Resultado de caixa" value={formatMoney(d.finance.cashResult)} hint="Recebido − despesas pagas (não é lucro contábil)" />
        </section>
      ) : null}

      <div className={styles.columns}>
        <section aria-labelledby="low-stock" className={styles.panel}>
          <h2 id="low-stock" className={styles.panelTitle}>
            Estoque baixo
          </h2>
          {d.lowStock.length ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Produto</th>
                  <th scope="col">SKU</th>
                  <th scope="col">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {d.lowStock.map((v) => (
                  <tr key={v.id}>
                    <td>{v.productName}</td>
                    <td>{v.sku}</td>
                    <td>{v.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>Nenhuma variante abaixo do limite.</p>
          )}
        </section>

        <section aria-labelledby="activity" className={styles.panel}>
          <h2 id="activity" className={styles.panelTitle}>
            Atividade recente
          </h2>
          {d.activity.length ? (
            <ul className={styles.activity}>
              {d.activity.map((a) => (
                <li key={a.id}>
                  <Link to="/admin/pedidos">Pedido {a.orderNumber}</Link> {statusLabel[a.toStatus] ?? a.toStatus}
                  <time dateTime={a.createdAt}> · {new Date(a.createdAt).toLocaleString('pt-BR')}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Sem atividade ainda.</p>
          )}
        </section>
      </div>
    </div>
  );
}
