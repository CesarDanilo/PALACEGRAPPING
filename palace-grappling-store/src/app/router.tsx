import { createBrowserRouter, Outlet, type RouteObject } from 'react-router';
import { AdminSessionProvider } from '@/features/admin-auth/AdminSession';
import { AdminLayout } from '@/layouts/AdminLayout';
import { StoreLayout } from '@/layouts/StoreLayout';
import { AdminPlaceholder } from '@/pages/admin/AdminPlaceholder';
import { DashboardPage } from '@/pages/admin/DashboardPage';
import { LoginPage } from '@/pages/admin/LoginPage';
import {
  AboutPage,
  CartPage,
  CatalogPage,
  CategoryPage,
  CheckoutPage,
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

const adminSection = (path: string, title: string, phase = 'fase 3') => ({ path, element: <AdminPlaceholder title={title} phase={phase} /> });

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
      { path: 'checkout', element: <CheckoutPage /> },
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
      <AdminSessionProvider>
        <Outlet />
      </AdminSessionProvider>
    ),
    children: [
      { path: 'login', element: <LoginPage /> },
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          adminSection('produtos', 'Produtos'),
          adminSection('produtos/novo', 'Novo produto'),
          adminSection('categorias', 'Categorias'),
          adminSection('estoque', 'Estoque'),
          adminSection('pedidos', 'Pedidos', 'fase 4'),
          adminSection('pedidos/:id', 'Pedido', 'fase 4'),
          adminSection('clientes', 'Clientes', 'fase 4'),
          adminSection('catalogos', 'Catálogos'),
          adminSection('links', 'Links exclusivos'),
          adminSection('financeiro', 'Financeiro', 'fase 4'),
          adminSection('financeiro/receitas', 'Receitas', 'fase 4'),
          adminSection('financeiro/despesas', 'Despesas', 'fase 4'),
          adminSection('relatorios', 'Relatórios', 'fase 4'),
          adminSection('configuracoes', 'Configurações'),
        ],
      },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
