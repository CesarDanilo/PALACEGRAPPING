import type { ReactNode } from 'react';
import styles from './PageShell.module.css';

/**
 * Estrutura temporária das páginas da loja enquanto a direção visual não é
 * definida a partir das referências. Mantém título, semântica e acessibilidade.
 */
export function PageShell({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <section className={`container ${styles.shell}`} aria-labelledby="page-title">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1 id="page-title" className={styles.title}>
        {title}
      </h1>
      {children}
      <p className={styles.notice}>Layout definitivo em construção: aguardando a análise das referências visuais.</p>
    </section>
  );
}
