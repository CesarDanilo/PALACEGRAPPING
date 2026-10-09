import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Outlet, type RouteObject } from 'react-router';
import { LoadingState } from '@/components/ui/Feedback';
import { StoreLayout } from '@/layouts/StoreLayout';
import {
  AboutPage,
  CartPage,
  CatalogPage,
  CategoryPage,
  CheckoutResultPage,
  CollectionsPage,
  ContactPage,
  ExclusiveLinkPage,
  HomePage,
  MyOrdersPage,
  NotFoundPage,
  OrderTrackingPage,
  PoliciesPage,
  ProductPage,
  ShopPage,
} from '@/pages/store/StorePages';

// Checkout (React Hook Form + Zod) também é sob demanda: só carrega quem vai finalizar.
const CheckoutPage = lazy(async () => ({ default: (await import('@/pages/store/CheckoutPage')).CheckoutPage }));

// O painel é carregado sob demanda: quem só compra não baixa o código administrativo.
const adminModule = () => import('./admin-routes');
type AdminModule = Awaited<ReturnType<typeof adminModule>>;
type AnyPage = ComponentType<Record<string, unknown>>;
const lazyAdmin = (name: keyof AdminModule) => lazy(async () => ({ default: (await adminModule())[name] as unknown as AnyPage }));
const AdminRoot = lazyAdmin('AdminRoot');
const AdminArea = lazyAdmin('AdminArea');
const page = (name: keyof AdminModule, props: Record<string, unknown> = {}, key?: string) => {
  const Page = lazyAdmin(name);
  return <Page key={key} {...props} />;
};

export const routes: RouteObject[] = [
  {
    element: <StoreLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'loja', element: <ShopPage /> },
      { path: 'colecoes', element: <CollectionsPage /> },
      { path: 'categoria/:slug', element: <CategoryPage /> },
      { path: 'produto/:slug', element: <ProductPage /> },
      { path: 'catalogo/:slug', element: <CatalogPage /> },
      { path: 'c/:token', element: <ExclusiveLinkPage /> },
      { path: 'carrinho', element: <CartPage /> },
      {
        path: 'checkout',
        element: (
          <Suspense fallback={<LoadingState label="Carregando checkout…" />}>
            <CheckoutPage />
          </Suspense>
        ),
      },
      { path: 'checkout/sucesso', element: <CheckoutResultPage /> },
      { path: 'pedido/:orderNumber', element: <OrderTrackingPage /> },
      { path: 'pedidos', element: <MyOrdersPage /> },
      { path: 'politicas', element: <PoliciesPage /> },
      { path: 'sobre', element: <AboutPage /> },
      { path: 'contato', element: <ContactPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: 'admin',
    element: (
      <Suspense fallback={<LoadingState label="Carregando painel…" />}>
        <AdminRoot>
          <Outlet />
        </AdminRoot>
      </Suspense>
    ),
    children: [
      { path: 'login', element: page('LoginPage') },
      {
        element: <AdminArea />,
        children: [
          { index: true, element: page('DashboardPage') },
          { path: 'produtos', element: page('ProductsPage') },
          { path: 'produtos/novo', element: page('ProductEditorPage') },
          { path: 'produtos/:id', element: page('ProductEditorPage') },
          { path: 'categorias', element: page('CategoriesPage') },
          { path: 'estoque', element: page('InventoryPage') },
          { path: 'pedidos', element: page('OrdersPage') },
          { path: 'pedidos/novo', element: page('NewOrderPage') },
          { path: 'pedidos/:id', element: page('OrderDetailPage') },
          { path: 'clientes', element: page('CustomersPage') },
          { path: 'clientes/:id', element: page('CustomerDetailPage') },
          { path: 'catalogos', element: page('CatalogsPage') },
          { path: 'links', element: page('LinksPage') },
          { path: 'financeiro', element: page('FinancePage') },
          { path: 'financeiro/receitas', element: page('EntriesPage', { kind: 'INCOME' }, 'income') },
          { path: 'financeiro/despesas', element: page('EntriesPage', { kind: 'EXPENSE' }, 'expense') },
          { path: 'relatorios', element: page('ReportsPage') },
          { path: 'configuracoes', element: page('SettingsPage') },
        ],
      },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
