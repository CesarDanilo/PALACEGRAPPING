import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/Feedback';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import styles from './AdminLayout.module.css';

const sections = [
  { to: '/admin', label: 'Painel', end: true },
  { to: '/admin/pedidos', label: 'Pedidos', permission: 'orders:read' },
  { to: '/admin/produtos', label: 'Produtos', permission: 'catalog:read' },
  { to: '/admin/categorias', label: 'Categorias', permission: 'catalog:read' },
  { to: '/admin/estoque', label: 'Estoque', permission: 'catalog:read' },
  { to: '/admin/clientes', label: 'Clientes', permission: 'customers:read' },
  { to: '/admin/catalogos', label: 'Catálogos', permission: 'catalog:read' },
  { to: '/admin/links', label: 'Links exclusivos', permission: 'catalog:read' },
  { to: '/admin/financeiro', label: 'Financeiro', permission: 'finance:read' },
  { to: '/admin/relatorios', label: 'Relatórios', permission: 'finance:read' },
  { to: '/admin/configuracoes', label: 'Configurações', permission: 'settings:write' },
];

/** Layout do painel com rotas protegidas. A API revalida a permissão em cada chamada. */
export function AdminLayout() {
  const { status, profile, membership, logout, selectTenant, can } = useAdminSession();
  const location = useLocation();

  if (status === 'loading') return <LoadingState label="Verificando sessão…" />;
  if (status === 'anonymous') return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  return (
    <div className={styles.shell}>
      <a href="#admin-conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <aside className={styles.sidebar}>
        <p className={styles.brand}>
          PALACE <span>ADMIN</span>
        </p>
        {profile && profile.memberships.length > 1 ? (
          <label className={styles.tenant}>
            <span className="visually-hidden">Loja</span>
            <select value={membership?.tenant.id} onChange={(e) => selectTenant(e.target.value)}>
              {profile.memberships.map((m) => (
                <option key={m.tenant.id} value={m.tenant.id}>
                  {m.tenant.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className={styles.tenantName}>{membership?.tenant.name ?? 'Sem loja'}</p>
        )}
        <nav aria-label="Painel">
          <ul className={styles.nav}>
            {sections
              .filter((s) => !s.permission || can(s.permission))
              .map((s) => (
                <li key={s.to}>
                  <NavLink to={s.to} end={s.end} className={({ isActive }) => (isActive ? styles.active : undefined)}>
                    {s.label}
                  </NavLink>
                </li>
              ))}
          </ul>
        </nav>
        <div className={styles.user}>
          <span>{profile?.user.name}</span>
          <span className={styles.role}>{membership?.role}</span>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            Sair
          </Button>
        </div>
      </aside>
      <main id="admin-conteudo" className={styles.main} tabIndex={-1}>
        {membership ? <Outlet /> : <p>Seu usuário não pertence a nenhuma loja ativa.</p>}
      </main>
    </div>
  );
}
