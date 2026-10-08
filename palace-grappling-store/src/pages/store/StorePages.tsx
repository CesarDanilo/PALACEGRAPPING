import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { AvailabilityBadge, EmptyState, LoadingState, Alert } from '@/components/ui/Feedback';
import { useCart } from '@/features/cart/cart-store';
import { readTrackingToken } from '@/features/checkout/tracking';
import { ApiError } from '@/lib/api/client';
import { storefrontApi, storefrontKeys } from '@/lib/api/storefront';
import type { PublicProduct } from '@/lib/api/types';
import { formatMoney } from '@/lib/money';
import { PageShell } from './PageShell';

// Páginas da loja na fase 1: rotas, dados e estados (carregando/erro/vazio) já
// integrados à API, com marcação provisória. A composição visual vem na fase 2.

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return 'Não foi possível carregar agora. Tente novamente.';
}

function ProductList({ products }: { products: PublicProduct[] }) {
  if (!products.length) return <EmptyState title="Nenhum produto por aqui ainda" />;
  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>
          <Link to={`/produto/${p.slug}`}>{p.name}</Link> — {formatMoney(p.priceRange.min)} <AvailabilityBadge value={p.availability} />
        </li>
      ))}
    </ul>
  );
}

export function HomePage() {
  const featured = useQuery({ queryKey: storefrontKeys.products({ featured: true, pageSize: 8 }), queryFn: () => storefrontApi.products({ featured: true, pageSize: 8 }) });
  return (
    <PageShell eyebrow="Jiu-Jitsu · Gi · No-Gi" title="Palace Grappling">
      {featured.isPending ? <LoadingState /> : featured.isError ? <Alert tone="danger">{errorMessage(featured.error)}</Alert> : <ProductList products={featured.data.items} />}
    </PageShell>
  );
}

export function CollectionsPage() {
  const categories = useQuery({ queryKey: storefrontKeys.categories, queryFn: storefrontApi.categories });
  return (
    <PageShell eyebrow="Linhas" title="Coleções">
      {categories.isPending ? (
        <LoadingState />
      ) : categories.isError ? (
        <Alert tone="danger">{errorMessage(categories.error)}</Alert>
      ) : (
        <ul>
          {categories.data.items.map((c) => (
            <li key={c.id}>
              <Link to={`/categoria/${c.slug}`}>{c.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

export function CategoryPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const query = { category: slug, page: Number(params.get('pagina') ?? 1), sort: (params.get('ordem') as 'relevance' | null) ?? 'relevance' };
  const products = useQuery({ queryKey: storefrontKeys.products(query), queryFn: () => storefrontApi.products(query) });
  return (
    <PageShell eyebrow="Categoria" title={slug.replace(/-/g, ' ')}>
      {products.isPending ? <LoadingState /> : products.isError ? <Alert tone="danger">{errorMessage(products.error)}</Alert> : <ProductList products={products.data.items} />}
    </PageShell>
  );
}

export function ProductPage() {
  const { slug = '' } = useParams();
  const product = useQuery({ queryKey: storefrontKeys.product(slug), queryFn: () => storefrontApi.product(slug) });
  if (product.isPending) return <LoadingState />;
  if (product.isError) return <PageShell title="Produto"><Alert tone="danger">{errorMessage(product.error)}</Alert></PageShell>;
  const p = product.data.product;
  return (
    <PageShell eyebrow={p.category?.name} title={p.name}>
      <p>{formatMoney(p.priceRange.min)}</p>
      <p>{p.description}</p>
    </PageShell>
  );
}

export function CatalogPage() {
  const { slug = '' } = useParams();
  const data = useQuery({ queryKey: storefrontKeys.catalog(slug, {}), queryFn: () => storefrontApi.catalog(slug) });
  return (
    <PageShell eyebrow="Catálogo" title={data.data?.catalog.name ?? 'Catálogo'}>
      {data.isPending ? <LoadingState /> : data.isError ? <Alert tone="danger">{errorMessage(data.error)}</Alert> : <ProductList products={data.data.products.items} />}
    </PageShell>
  );
}

/** Link exclusivo: o token carrega a seleção; nada de dados de cliente na URL. */
export function ExclusiveLinkPage() {
  const { token = '' } = useParams();
  const data = useQuery({ queryKey: storefrontKeys.link(token, {}), queryFn: () => storefrontApi.link(token), retry: false });
  return (
    <PageShell eyebrow="Acesso exclusivo" title={data.data?.catalog.name ?? 'Seleção exclusiva'}>
      {data.isPending ? (
        <LoadingState />
      ) : data.isError ? (
        <Alert tone="warning" title="Link indisponível">
          {errorMessage(data.error)}
        </Alert>
      ) : (
        <ProductList products={data.data.products.items} />
      )}
    </PageShell>
  );
}

export function CartPage() {
  const cart = useCart();
  return (
    <PageShell title="Carrinho">
      {cart.items.length ? (
        <ul>
          {cart.items.map((i) => (
            <li key={i.variantId}>
              {i.quantity}× {i.productName} ({i.variantLabel})
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Seu carrinho está vazio">
          <Link to="/colecoes">Ver coleções</Link>
        </EmptyState>
      )}
    </PageShell>
  );
}

export function CheckoutPage() {
  return <PageShell title="Finalizar compra" />;
}

export function CheckoutResultPage() {
  const [params] = useSearchParams();
  const number = params.get('pedido');
  return (
    <PageShell title="Pedido recebido">
      <p>
        O pagamento é confirmado pelo provedor, não por esta página. {number ? <Link to={`/pedido/${number}`}>Acompanhar pedido {number}</Link> : null}
      </p>
    </PageShell>
  );
}

const statusLabel: Record<string, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  PAID: 'Pagamento aprovado',
  PREPARING: 'Em preparação',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
  RETURNED: 'Devolvido',
};

export function OrderTrackingPage() {
  const { orderNumber = '' } = useParams();
  const token = readTrackingToken(orderNumber);
  const order = useQuery({
    queryKey: storefrontKeys.order(orderNumber),
    queryFn: () => storefrontApi.order(orderNumber, token ?? ''),
    enabled: Boolean(token),
    retry: false,
  });
  return (
    <PageShell eyebrow="Pedido" title={orderNumber}>
      {!token ? (
        <Alert tone="info">Abra o acompanhamento no mesmo navegador usado na compra ou use o link enviado na confirmação.</Alert>
      ) : order.isPending ? (
        <LoadingState />
      ) : order.isError ? (
        <Alert tone="danger">{errorMessage(order.error)}</Alert>
      ) : (
        <p>
          {statusLabel[order.data.status] ?? order.data.status} · {formatMoney(order.data.total, order.data.currency)}
        </p>
      )}
    </PageShell>
  );
}

export function AboutPage() {
  return <PageShell eyebrow="A marca" title="Disciplina vestida" />;
}

export function ContactPage() {
  const store = useQuery({ queryKey: storefrontKeys.store, queryFn: storefrontApi.store });
  return (
    <PageShell title="Contato">
      {store.data?.contactEmail ? <a href={`mailto:${store.data.contactEmail}`}>{store.data.contactEmail}</a> : null}
    </PageShell>
  );
}

export function NotFoundPage() {
  return (
    <PageShell eyebrow="404" title="Página não encontrada">
      <Link to="/">Voltar para a loja</Link>
    </PageShell>
  );
}
