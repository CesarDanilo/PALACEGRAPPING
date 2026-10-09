import { createBrowserRouter, Outlet, type RouteObject } from 'react-router';
import { AdminSessionProvider } from '@/features/admin-auth/AdminSession';
import { AdminLayout } from '@/layouts/AdminLayout';
import { StoreLayout } from '@/layouts/StoreLayout';
import { CatalogsPage, CategoriesPage, InventoryPage, LinksPage } from '@/pages/admin/CatalogAdminPages';
import { DashboardPage } from '@/pages/admin/DashboardPage';
import { LoginPage } from '@/pages/admin/LoginPage';
import { CustomerDetailPage, CustomersPage, EntriesPage, FinancePage, OrderDetailPage, OrdersPage, ReportsPage, SettingsPage } from '@/pages/admin/OperationsPages';
import { ProductEditorPage, ProductsPage } from '@/pages/admin/ProductsPages';
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
          { path: 'produtos', element: <ProductsPage /> },
          { path: 'produtos/novo', element: <ProductEditorPage /> },
          { path: 'produtos/:id', element: <ProductEditorPage /> },
          { path: 'categorias', element: <CategoriesPage /> },
          { path: 'estoque', element: <InventoryPage /> },
          { path: 'pedidos', element: <OrdersPage /> },
          { path: 'pedidos/:id', element: <OrderDetailPage /> },
          { path: 'clientes', element: <CustomersPage /> },
          { path: 'clientes/:id', element: <CustomerDetailPage /> },
          { path: 'catalogos', element: <CatalogsPage /> },
          { path: 'links', element: <LinksPage /> },
          { path: 'financeiro', element: <FinancePage /> },
          { path: 'financeiro/receitas', element: <EntriesPage key="income" kind="INCOME" /> },
          { path: 'financeiro/despesas', element: <EntriesPage key="expense" kind="EXPENSE" /> },
          { path: 'relatorios', element: <ReportsPage /> },
          { path: 'configuracoes', element: <SettingsPage /> },
        ],
      },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
