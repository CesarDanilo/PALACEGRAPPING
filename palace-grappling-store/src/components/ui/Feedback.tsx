import type { ReactNode } from 'react';
import type { Availability } from '@/lib/api/types';
import styles from './ui.module.css';

export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: string; children: ReactNode }) {
  return (
    <div className={`${styles.alert} ${styles[`alert_${tone}`]}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {title ? <strong className={styles.alertTitle}>{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className={styles.state} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.state}>
      <strong>{title}</strong>
      {children ? <div className={styles.stateBody}>{children}</div> : null}
    </div>
  );
}

const availabilityLabel: Record<Availability, string> = { ok: 'Disponível', low: 'Últimas unidades', out: 'Esgotado' };

export function AvailabilityBadge({ value }: { value: Availability }) {
  return <span className={`${styles.badge} ${styles[`badge_${value}`]}`}>{availabilityLabel[value]}</span>;
}
