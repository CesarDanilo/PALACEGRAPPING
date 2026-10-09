import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import {
  BookIcon,
  BoxIcon,
  ChartIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DashboardIcon,
  FolderIcon,
  GearIcon,
  LinkIcon,
  LogoutIcon,
  MenuIcon,
  OrdersIcon,
  TagIcon,
  UsersIcon,
  WalletIcon,
} from '@/components/icons';
import { LoadingState } from '@/components/ui/Feedback';
import { brand } from '@/config/env';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import styles from './AdminLayout.module.css';

type Section = { to: string; label: string; icon: ComponentType<{ size?: number }>; end?: boolean; permission?: string };

const groups: { title: string; items: Section[] }[] = [
  {
    title: 'Operação',
    items: [
      { to: '/admin', label: 'Painel', icon: DashboardIcon, end: true },
      { to: '/admin/pedidos', label: 'Pedidos', icon: OrdersIcon, permission: 'orders:read' },
      { to: '/admin/estoque', label: 'Estoque', icon: BoxIcon, permission: 'catalog:read' },
      { to: '/admin/clientes', label: 'Clientes', icon: UsersIcon, permission: 'customers:read' },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      { to: '/admin/produtos', label: 'Produtos', icon: TagIcon, permission: 'catalog:read' },
      { to: '/admin/categorias', label: 'Categorias', icon: FolderIcon, permission: 'catalog:read' },
      { to: '/admin/catalogos', label: 'Catálogos', icon: BookIcon, permission: 'catalog:read' },
      { to: '/admin/links', label: 'Links exclusivos', icon: LinkIcon, permission: 'catalog:read' },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { to: '/admin/financeiro', label: 'Financeiro', icon: WalletIcon, permission: 'finance:read' },
      { to: '/admin/relatorios', label: 'Relatórios', icon: ChartIcon, permission: 'finance:read' },
      { to: '/admin/configuracoes', label: 'Configurações e equipe', icon: GearIcon, permission: 'settings:write' },
    ],
  },
];

const COLLAPSE_KEY = 'pg.admin.sidebar';
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'collapsed';
  } catch {
    return false;
  }
};

/** Layout do painel com rotas protegidas. A API revalida a permissão em cada chamada. */
export function AdminLayout() {
  const { status, profile, membership, logout, selectTenant, can } = useAdminSession();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  // Desktop: menu recolhido mostra só os ícones (preferência lembrada neste navegador).
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? 'collapsed' : 'expanded');
    } catch {
      /* armazenamento indisponível */
    }
  }, [collapsed]);

  // Abaixo de 1024 px o menu é uma gaveta: fecha ao navegar e com Esc.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    document.querySelector<HTMLElement>('#admin-menu a[aria-current="page"], #admin-menu a')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  if (status === 'loading') return <LoadingState label="Verificando sessão…" />;
  if (status === 'anonymous') return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  const close = () => {
    setMenuOpen(false);
    menuButton.current?.focus();
  };
  const initials = (profile?.user.name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const roleLabel = membership?.role === 'OWNER' ? 'Proprietário' : membership?.role === 'ADMIN' ? 'Administrador' : 'Operador';

  return (
    <div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ''}`}>
      <a href="#admin-conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <header className={styles.topbar}>
        <button
          ref={menuButton}
          type="button"
          className={styles.iconButton}
          aria-label="Abrir menu do painel"
          aria-expanded={menuOpen}
          aria-controls="admin-menu"
          onClick={() => setMenuOpen(true)}
        >
          <MenuIcon />
        </button>
        <p className={styles.brand}>
          {brand.short} <span>{brand.adminLabel}</span>
        </p>
        <span className={styles.topbarTenant}>{membership?.tenant.name}</span>
      </header>
      {menuOpen ? <div className={styles.backdrop} onClick={close} aria-hidden="true" /> : null}
      <aside id="admin-menu" className={`${styles.sidebar} ${menuOpen ? styles.open : ''}`} aria-label="Menu do painel">
        <div className={styles.sidebarTop}>
          <p className={styles.brand} title={brand.name}>
            {collapsed ? (
              <span className={styles.brandMark} aria-label={`${brand.short} ${brand.adminLabel}`}>
                {brand.short.slice(0, 1)}
              </span>
            ) : (
              <>
                {brand.short} <span>{brand.adminLabel}</span>
              </>
            )}
          </p>
          <button type="button" className={`${styles.iconButton} ${styles.closeButton}`} aria-label="Fechar menu do painel" onClick={close}>
            <CloseIcon />
          </button>
        </div>
        {profile && profile.memberships.length > 1 && !collapsed ? (
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
        ) : !collapsed ? (
          <p className={styles.tenantName}>{membership?.tenant.name ?? 'Sem loja'}</p>
        ) : null}
        <nav aria-label="Painel" className={styles.navWrap}>
          {groups.map((group) => {
            const items = group.items.filter((s) => !s.permission || can(s.permission));
            if (!items.length) return null;
            return (
              <div key={group.title} className={styles.navGroup}>
                <p className={styles.navGroupTitle} aria-hidden={collapsed}>
                  {group.title}
                </p>
                <ul className={styles.nav}>
                  {items.map(({ to, label, icon: Icon, end }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        end={end}
                        title={collapsed ? label : undefined}
                        aria-label={collapsed ? label : undefined}
                        className={({ isActive }) => (isActive ? styles.active : undefined)}
                      >
                        <Icon size={20} />
                        <span className={styles.navLabel}>{label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className={styles.user}>
          <span className={styles.avatar} aria-hidden="true">
            {initials}
          </span>
          <span className={styles.userText}>
            <strong>{profile?.user.name}</strong>
            <span className={styles.role}>{roleLabel}</span>
          </span>
          <button type="button" className={styles.iconButton} onClick={() => void logout()} aria-label="Sair" title="Sair">
            <LogoutIcon size={18} />
          </button>
        </div>
        <button
          type="button"
          className={styles.collapseButton}
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-pressed={collapsed}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <ChevronRightIcon size={18} /> : <ChevronLeftIcon size={18} />}
          <span className={styles.navLabel}>Recolher menu</span>
        </button>
      </aside>
      <main id="admin-conteudo" className={styles.main} tabIndex={-1}>
        {membership ? <Outlet /> : <p>Seu usuário não pertence a nenhuma loja ativa.</p>}
      </main>
    </div>
  );
}
