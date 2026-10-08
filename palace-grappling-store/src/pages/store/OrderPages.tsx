import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { ListingHero } from '@/components/store/ProductListing';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { listTrackedOrders, readTrackingToken } from '@/features/checkout/tracking';
import { ApiError } from '@/lib/api/client';
import { storefrontApi, storefrontKeys } from '@/lib/api/storefront';
import type { OrderStatus, PublicOrder } from '@/lib/api/types';
import { formatMoney } from '@/lib/money';
import styles from './checkout.module.css';

export const orderStatusLabel: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  PAID: 'Pagamento aprovado',
  PREPARING: 'Em preparação',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
  RETURNED: 'Devolvido',
};

const steps: { status: OrderStatus[]; label: string }[] = [
  { status: ['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED'], label: 'Pago' },
  { status: ['PREPARING', 'SHIPPED', 'DELIVERED'], label: 'Preparação' },
  { status: ['SHIPPED', 'DELIVERED'], label: 'Enviado' },
  { status: ['DELIVERED'], label: 'Entregue' },
];

function useTrackedOrder(number: string, poll: boolean) {
  const token = readTrackingToken(number);
  const query = useQuery({
    queryKey: storefrontKeys.order(number),
    queryFn: () => storefrontApi.order(number, token ?? ''),
    enabled: Boolean(token),
    retry: false,
    // Enquanto o pagamento está pendente, consulta a API (a confirmação chega por webhook).
    refetchInterval: (q) => (poll && q.state.data?.status === 'PENDING_PAYMENT' ? 5000 : false),
  });
  return { token, query };
}

function PayButton({ order, token }: { order: PublicOrder; token: string }) {
  const pay = useMutation({
    mutationFn: () => storefrontApi.startPayment(order.number, token),
    onSuccess: (result) => {
      if (result.status === 'READY' && result.checkoutUrl) window.location.assign(result.checkoutUrl);
    },
  });
  if (order.status !== 'PENDING_PAYMENT') return null;
  return (
    <div>
      <Button loading={pay.isPending} onClick={() => pay.mutate()}>
        {order.payment?.status === 'REJECTED' ? 'Tentar outro pagamento' : 'Ir para o pagamento'}
      </Button>
      {pay.data && pay.data.status !== 'READY' ? <Alert tone="warning">{pay.data.message}</Alert> : null}
      {pay.isError ? <Alert tone="danger">{pay.error instanceof ApiError ? pay.error.message : 'Falha ao iniciar o pagamento.'}</Alert> : null}
    </div>
  );
}

function OrderDetails({ order, token }: { order: PublicOrder; token: string }) {
  const tone =
    order.status === 'PENDING_PAYMENT' ? styles.statusWarn : ['CANCELLED', 'EXPIRED', 'RETURNED'].includes(order.status) ? styles.statusBad : styles.statusOk;
  return (
    <div className={styles.status}>
      <section className={`${styles.statusCard} ${tone}`} aria-live="polite">
        <p className="eyebrow">Pedido {order.number}</p>
        <h2 className={styles.statusTitle}>{orderStatusLabel[order.status]}</h2>
        {order.status === 'PENDING_PAYMENT' ? (
          <p>
            Estamos aguardando a confirmação do provedor de pagamento
            {order.paymentExpiresAt ? `, até ${new Date(order.paymentExpiresAt).toLocaleString('pt-BR')}` : ''}. Esta página atualiza sozinha.
            {order.payment?.status === 'REJECTED' ? ' O último pagamento foi recusado.' : ''}
          </p>
        ) : order.status === 'EXPIRED' ? (
          <p>O prazo de pagamento terminou e os itens voltaram para o estoque. Você pode fazer um novo pedido.</p>
        ) : order.status === 'CANCELLED' ? (
          <p>Este pedido foi cancelado.</p>
        ) : null}
        {!['CANCELLED', 'EXPIRED'].includes(order.status) ? (
          <ol className={styles.timeline} aria-label="Andamento">
            {steps.map((s) => (
              <li key={s.label} data-done={s.status.includes(order.status)}>
                {s.label}
              </li>
            ))}
          </ol>
        ) : null}
        {order.shipping.trackingCode ? (
          <p>
            Rastreio: <span className="mono">{order.shipping.trackingCode}</span>
            {order.shipping.carrier ? ` (${order.shipping.carrier})` : ''}
          </p>
        ) : null}
        <PayButton order={order} token={token} />
      </section>
      <section aria-labelledby="itens">
        <h2 id="itens" className="eyebrow">
          Itens
        </h2>
        <ul className={styles.orderItems}>
          {order.items.map((i, idx) => (
            <li key={idx}>
              <span>
                {i.quantity}× {i.productName} <span className="mono">{i.variantLabel}</span>
              </span>
              <span>{formatMoney(i.lineTotal, order.currency)}</span>
            </li>
          ))}
          <li>
            <span>Frete</span>
            <span>{order.shippingTotal === 0 ? 'Grátis' : formatMoney(order.shippingTotal, order.currency)}</span>
          </li>
          <li>
            <strong>Total</strong>
            <strong>{formatMoney(order.total, order.currency)}</strong>
          </li>
        </ul>
        <p className={styles.small}>
          Entrega em {order.shippingAddress.district}, {order.shippingAddress.city}/{order.shippingAddress.state}.
        </p>
      </section>
    </div>
  );
}

function NoToken() {
  return (
    <Alert tone="info" title="Acompanhamento protegido">
      Por segurança, o pedido só abre no navegador usado na compra. Se precisar de ajuda, fale com a gente pela página de <Link to="/contato">contato</Link>.
    </Alert>
  );
}

/** Retorno do checkout. O status exibido vem sempre da API, nunca dos parâmetros da URL do provedor. */
export function CheckoutResultPage() {
  const [params] = useSearchParams();
  const number = params.get('pedido') ?? '';
  const { token, query } = useTrackedOrder(number, true);
  return (
    <>
      <ListingHero eyebrow="Obrigado" title="Pedido recebido" />
      <div className="container">
        {!number || !token ? <NoToken /> : query.isPending ? <LoadingState /> : query.isError ? <Alert tone="danger">Não encontramos este pedido.</Alert> : <OrderDetails order={query.data} token={token} />}
      </div>
    </>
  );
}

export function OrderTrackingPage() {
  const { orderNumber = '' } = useParams();
  const { token, query } = useTrackedOrder(orderNumber, true);
  return (
    <>
      <ListingHero eyebrow="Acompanhar" title={`Pedido ${orderNumber}`} />
      <div className="container">
        {!token ? <NoToken /> : query.isPending ? <LoadingState /> : query.isError ? <Alert tone="danger">Não encontramos este pedido.</Alert> : <OrderDetails order={query.data} token={token} />}
      </div>
    </>
  );
}

/** Pedidos feitos neste navegador (não há conta de cliente; o acesso é pelo token guardado aqui). */
export function MyOrdersPage() {
  const tracked = listTrackedOrders();
  const results = useQueries({
    queries: tracked.map(({ number, token }) => ({
      queryKey: storefrontKeys.order(number),
      queryFn: () => storefrontApi.order(number, token),
      retry: false,
    })),
  });
  return (
    <>
      <ListingHero eyebrow="Conta" title="Meus pedidos" description="Pedidos feitos neste navegador." />
      <div className="container">
        {!tracked.length ? (
          <EmptyState title="Nenhum pedido por aqui">
            <Link to="/loja">Ir para a loja</Link>
          </EmptyState>
        ) : (
          <ul className={styles.orderItems}>
            {tracked.map(({ number }, i) => {
              const r = results[i];
              return (
                <li key={number}>
                  <Link to={`/pedido/${number}`} className="mono">
                    {number}
                  </Link>
                  <span>{r?.data ? `${orderStatusLabel[r.data.status]} · ${formatMoney(r.data.total, r.data.currency)}` : r?.isError ? 'Indisponível' : '…'}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
