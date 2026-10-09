// Ponto de entrada do pacote do painel (carregado sob demanda pelo router).
import type { ReactNode } from 'react';
import { AdminSessionProvider } from '@/features/admin-auth/AdminSession';
import { AdminLayout } from '@/layouts/AdminLayout';

export function AdminRoot({ children }: { children?: ReactNode }) {
  return <AdminSessionProvider>{children}</AdminSessionProvider>;
}
export const AdminArea = AdminLayout;
export { LoginPage } from '@/pages/admin/LoginPage';
export { DashboardPage } from '@/pages/admin/DashboardPage';
export { ProductEditorPage, ProductsPage } from '@/pages/admin/ProductsPages';
export { CatalogsPage, CategoriesPage, LinksPage } from '@/pages/admin/CatalogAdminPages';
export { InventoryPage } from '@/pages/admin/InventoryPage';
export { NewOrderPage } from '@/pages/admin/NewOrderPage';
export { CustomerDetailPage, CustomersPage, EntriesPage, FinancePage, OrderDetailPage, OrdersPage, ReportsPage, SettingsPage } from '@/pages/admin/OperationsPages';
