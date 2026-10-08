import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './ui.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', block, loading, disabled, children, className, ...rest }: Props) {
  const classes = [styles.button, styles[variant], size === 'sm' && styles.small, block && styles.block, className].filter(Boolean).join(' ');
  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}
