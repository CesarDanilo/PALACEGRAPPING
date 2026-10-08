import styles from './admin.module.css';

/** Seções do painel previstas para a fase 3 (rotas e permissões já ativas). */
export function AdminPlaceholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{title}</h1>
      </header>
      <p className={styles.muted}>Interface prevista para a {phase}. Os endpoints correspondentes já existem na API.</p>
    </div>
  );
}
