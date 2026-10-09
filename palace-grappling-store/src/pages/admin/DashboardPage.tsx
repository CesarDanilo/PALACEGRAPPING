import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { AlertIcon, BoxIcon, ChartIcon, OrdersIcon, WalletIcon } from '@/components/icons';
import { Alert, LoadingState } from '@/components/ui/Feedback';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import { api } from '@/lib/api/client';
import type { Dashboard } from '@/lib/api/types';
import { formatMoney } from '@/lib/money';
import { StatusPill } from './common';
import { Callout, Kpi, StockBadge, useLowStockThreshold } from './highlights';
import styles from './admin.module.css';

export function DashboardPage() {
  const { membership } = useAdminSession();
  const threshold = useLowStockThreshold();
  const dashboard = useQuery({
    queryKey: ['admin', membership?.tenant.id, 'dashboard'],
    queryFn: () => api<Dashboard>('/dashboard', { admin: true }),
  });

  if (dashboard.isPending) return <LoadingState />;
  if (dashboard.isError) return <Alert tone="danger">Não foi possível carregar o painel.</Alert>;
  const d = dashboard.data;
  const outOfStock = d.lowStock.filter((v) => v.stock <= 0).length;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Painel</h1>
        <p className={styles.muted}>Resumo do mês corrente</p>
      </header>

      {d.toFulfil > 0 ? (
        <Callout tone="info" action={<Link to="/admin/pedidos?status=PAID" className={styles.linkButton}>Ver pedidos</Link>}>
          <strong>{d.toFulfil}</strong> {d.toFulfil === 1 ? 'pedido pago espera' : 'pedidos pagos esperam'} separação e envio.
        </Callout>
      ) : null}
      {d.lowStock.length > 0 ? (
        <Callout tone={outOfStock ? 'danger' : 'warn'} action={<Link to="/admin/estoque" className={styles.linkButton}>Repor estoque</Link>}>
          {outOfStock ? (
            <>
              <strong>{outOfStock}</strong> {outOfStock === 1 ? 'variante esgotada' : 'variantes esgotadas'} e{' '}
            </>
          ) : null}
          <strong>{d.lowStock.length - outOfStock}</strong> com estoque baixo (até {threshold} unidades).
        </Callout>
      ) : null}

      <section aria-label="Operação" className={styles.kpis}>
        <Kpi label="Para separar e enviar" value={d.toFulfil} icon={OrdersIcon} tone={d.toFulfil ? 'info' : 'neutral'} to="/admin/pedidos?status=PAID" hint="Pedidos pagos" />
        <Kpi label="Aguardando pagamento" value={d.pendingOrders} icon={OrdersIcon} tone={d.pendingOrders ? 'warn' : 'neutral'} to="/admin/pedidos?status=PENDING_PAYMENT" />
        <Kpi
          label="Estoque baixo"
          value={d.lowStock.length}
          icon={d.lowStock.length ? AlertIcon : BoxIcon}
          tone={outOfStock ? 'danger' : d.lowStock.length ? 'warn' : 'success'}
          to="/admin/estoque"
          hint={outOfStock ? `${outOfStock} esgotada(s)` : d.lowStock.length ? 'Precisa de reposição' : 'Tudo abastecido'}
        />
        <Kpi label="Cobranças pendentes" value={d.awaitingPayments} icon={WalletIcon} tone={d.awaitingPayments ? 'warn' : 'neutral'} />
      </section>

      {d.finance ? (
        <section aria-label="Financeiro" className={styles.kpis}>
          <Kpi label="Vendas aprovadas" value={formatMoney(d.finance.salesApproved.total)} icon={ChartIcon} tone="accent" hint={`${d.finance.salesApproved.count} pagamentos aprovados`} to="/admin/financeiro" />
          <Kpi label="Recebido" value={formatMoney(d.finance.received)} icon={WalletIcon} tone="success" hint="Receitas recebidas no período" />
          <Kpi label="Despesas pagas" value={formatMoney(d.finance.expensesPaid)} icon={WalletIcon} tone={d.finance.expensesPaid ? 'warn' : 'neutral'} />
          <Kpi
            label="Resultado de caixa"
            value={formatMoney(d.finance.cashResult)}
            icon={ChartIcon}
            tone={d.finance.cashResult < 0 ? 'danger' : d.finance.cashResult > 0 ? 'success' : 'neutral'}
            hint="Recebido − despesas pagas (não é lucro contábil)"
          />
          <Kpi label="Pedidos criados" value={formatMoney(d.finance.ordersCreated.total)} hint={`${d.finance.ordersCreated.count} pedidos, qualquer status`} />
        </section>
      ) : null}

      <div className={styles.columns}>
        <section aria-labelledby="low-stock" className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 id="low-stock" className={styles.panelTitle}>
              Estoque baixo
            </h2>
            <Link to="/admin/estoque" className={styles.linkButton}>
              Repor
            </Link>
          </div>
          {d.lowStock.length ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Produto</th>
                  <th scope="col">Variante</th>
                  <th scope="col">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {[...d.lowStock]
                  .sort((a, b) => a.stock - b.stock)
                  .map((v) => (
                    <tr key={v.id} className={v.stock <= 0 ? styles.rowDanger : styles.rowWarn}>
                      <td>
                        <Link to={`/admin/estoque?variante=${v.id}`}>{v.productName}</Link>
                      </td>
                      <td className={styles.muted}>{[v.size, v.color].filter(Boolean).join(' · ') || v.sku}</td>
                      <td>
                        <StockBadge stock={v.stock} threshold={threshold} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>Nenhuma variante abaixo do limite de {threshold} unidades.</p>
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
                  <StatusPill status={a.toStatus} /> <Link to={`/admin/pedidos?q=${encodeURIComponent(a.orderNumber)}`}>Pedido {a.orderNumber}</Link>
                  <time dateTime={a.createdAt} className={styles.muted}>
                    {' '}
                    · {new Date(a.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </time>
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
