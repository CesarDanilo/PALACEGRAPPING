import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BeltBar, Logo, Monogram } from '@/brand/Brand';
import { BagIcon, CloseIcon, MenuIcon, SearchIcon, UserIcon } from '@/components/icons';
import { ToastHost } from '@/components/ui/Toast';
import { useCartCount } from '@/features/cart/cart-store';
import { storefrontApi, storefrontKeys } from '@/lib/api/storefront';
import styles from './StoreLayout.module.css';
import { brand } from '@/config/env';

const nav = [
  { to: '/loja?linha=gi', label: 'Gi' },
  { to: '/loja?linha=no-gi', label: 'No-Gi' },
  { to: '/loja?ordem=newest', label: 'Lançamentos' },
  { to: '/colecoes', label: 'Coleções' },
  { to: '/sobre', label: 'A marca' },
];

function SearchForm({ onDone, autoFocus }: { onDone?: () => void; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    navigate(`/loja?q=${encodeURIComponent(q.trim())}`);
    onDone?.();
  };
  return (
    <form role="search" className={styles.search} onSubmit={submit}>
      <label htmlFor="busca" className="visually-hidden">
        Buscar produtos
      </label>
      <SearchIcon size={18} />
      <input id="busca" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar kimono, rash guard, shorts…" autoFocus={autoFocus} />
    </form>
  );
}

export function StoreLayout() {
  const count = useCartCount();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const store = useQuery({ queryKey: storefrontKeys.store, queryFn: storefrontApi.store, staleTime: 5 * 60_000 });

  // Fecha menu e busca ao navegar.
  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

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
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <>
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <header className={styles.header}>
        <div className={`container ${styles.bar}`}>
          <button
            ref={menuButton}
            type="button"
            className={`${styles.iconButton} ${styles.menuButton}`}
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            aria-controls="menu-mobile"
            onClick={() => setMenuOpen(true)}
          >
            <MenuIcon />
          </button>
          <Link to="/" className={styles.brand} aria-label={`${brand.name}, página inicial`}>
            <Logo />
          </Link>
          <nav aria-label="Principal" className={styles.navDesktop}>
            <ul>
              {nav.map((item) => (
                <li key={item.label}>
                  <NavLink to={item.to} className={({ isActive }) => (isActive && !item.to.includes('?') ? styles.active : undefined)}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={searchOpen ? 'Fechar busca' : 'Buscar'}
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((v) => !v)}
            >
              {searchOpen ? <CloseIcon /> : <SearchIcon />}
            </button>
            <Link to="/pedidos" className={`${styles.iconButton} ${styles.ordersLink}`} aria-label="Meus pedidos">
              <UserIcon />
            </Link>
            <Link to="/carrinho" className={`${styles.iconButton} ${styles.cart}`} aria-label={`Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`}>
              <BagIcon />
              {count > 0 ? (
                <span className={styles.count} aria-hidden="true">
                  {count}
                </span>
              ) : null}
            </Link>
          </div>
        </div>
        {searchOpen ? (
          <div className={`container ${styles.searchRow}`}>
            <SearchForm autoFocus onDone={() => setSearchOpen(false)} />
          </div>
        ) : null}
      </header>

      {menuOpen ? (
        <div className={styles.drawerBackdrop} onClick={() => setMenuOpen(false)}>
          <div id="menu-mobile" role="dialog" aria-modal="true" aria-label="Menu" className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerTop}>
              <Logo compact />
              <button type="button" className={styles.iconButton} aria-label="Fechar menu" onClick={() => setMenuOpen(false)} autoFocus>
                <CloseIcon />
              </button>
            </div>
            <SearchForm onDone={() => setMenuOpen(false)} />
            <nav aria-label="Menu móvel">
              <ol className={styles.drawerNav}>
                {nav.map((item) => (
                  <li key={item.label}>
                    <Link to={item.to}>{item.label}</Link>
                  </li>
                ))}
                <li>
                  <Link to="/pedidos">Meus pedidos</Link>
                </li>
              </ol>
            </nav>
            <BeltBar />
          </div>
        </div>
      ) : null}

      <main id="conteudo" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className={styles.footer}>
        <div className="container">
          <div className={styles.footerTop}>
            <div className={styles.footerBrand}>
              <Monogram size={64} />
              <p className={styles.footerClaim}>
                Feito para quem <br />
                volta ao tatame<span className={styles.accentDot}>.</span>
              </p>
            </div>
            <nav aria-label="Loja" className={styles.footerCol}>
              <h2 className="label">Loja</h2>
              <ul>
                <li><Link to="/loja?linha=gi">Linha Gi</Link></li>
                <li><Link to="/loja?linha=no-gi">Linha No-Gi</Link></li>
                <li><Link to="/categoria/acessorios">Acessórios</Link></li>
                <li><Link to="/colecoes">Coleções</Link></li>
              </ul>
            </nav>
            <nav aria-label="Ajuda" className={styles.footerCol}>
              <h2 className="label">Ajuda</h2>
              <ul>
                <li><Link to="/pedidos">Acompanhar pedido</Link></li>
                <li><Link to="/contato">Contato</Link></li>
                <li><Link to="/politicas">Trocas e devoluções</Link></li>
                <li><Link to="/politicas#privacidade">Privacidade</Link></li>
              </ul>
            </nav>
            <div className={styles.footerCol}>
              <h2 className="label">Contato</h2>
              <ul>
                {store.data?.contactEmail ? <li><a href={`mailto:${store.data.contactEmail}`}>{store.data.contactEmail}</a></li> : null}
                {store.data?.contactPhone ? <li><a href={`tel:${store.data.contactPhone.replace(/\D/g, '')}`}>{store.data.contactPhone}</a></li> : null}
                <li><Link to="/sobre">A marca</Link></li>
              </ul>
            </div>
          </div>
          <BeltBar />
          <div className={styles.footerBottom}>
            <span>© {new Date().getFullYear()} {brand.name}</span>
            <span>Oss.</span>
          </div>
        </div>
      </footer>
      <ToastHost />
      <ScrollRestoration />
    </>
  );
}
