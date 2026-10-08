import { Link, NavLink, Outlet } from 'react-router';
import { useCartCount } from '@/features/cart/cart-store';
import styles from './StoreLayout.module.css';

// Estrutura provisória da loja: cabeçalho, conteúdo e rodapé com navegação
// acessível. A composição visual definitiva será feita após a análise das referências.

const nav = [
  { to: '/categoria/kimonos', label: 'Gi' },
  { to: '/categoria/rash-guards', label: 'No-Gi' },
  { to: '/colecoes', label: 'Coleções' },
  { to: '/sobre', label: 'A marca' },
];

export function StoreLayout() {
  const count = useCartCount();
  return (
    <>
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <header className={styles.header}>
        <div className={`container ${styles.bar}`}>
          <Link to="/" className={styles.wordmark} aria-label="Palace Grappling, página inicial">
            PALACE <span>GRAPPLING</span>
          </Link>
          <nav aria-label="Principal">
            <ul className={styles.nav}>
              {nav.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={({ isActive }) => (isActive ? styles.active : undefined)}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <Link to="/carrinho" className={styles.cart}>
            Carrinho <span className={styles.count} aria-label={`${count} itens`}>{count}</span>
          </Link>
        </div>
      </header>
      <main id="conteudo" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <div className="container">
          <nav aria-label="Rodapé">
            <ul className={styles.footerNav}>
              <li>
                <Link to="/sobre">Sobre</Link>
              </li>
              <li>
                <Link to="/contato">Contato</Link>
              </li>
              <li>
                <Link to="/colecoes">Coleções</Link>
              </li>
            </ul>
          </nav>
          <p className={styles.legal}>© {new Date().getFullYear()} Palace Grappling</p>
        </div>
      </footer>
    </>
  );
}
