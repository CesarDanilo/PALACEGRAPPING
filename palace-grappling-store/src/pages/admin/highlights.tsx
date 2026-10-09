import { useQuery } from '@tanstack/react-query';
import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router';
import { adminApi } from '@/lib/api/admin';
import { useAdminKey } from './common';
import styles from './admin.module.css';

// Destaques visuais do painel: a cor só muda quando o número pede atenção.

export type Tone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger' | 'info';

/** Indicador (KPI) com ícone, tom de destaque e link opcional para o detalhe. */
export function Kpi({
  label,
  value,
  hint,
  tone = 'neutral',
  icon: Icon,
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ComponentType<{ size?: number }>;
  to?: string;
}) {
  const body = (
    <>
      <span className={styles.kpiHead}>
        {Icon ? (
          <span className={styles.kpiIcon} aria-hidden="true">
            <Icon size={18} />
          </span>
        ) : null}
        <span className={styles.metricLabel}>{label}</span>
      </span>
      <strong className={styles.kpiValue}>{value}</strong>
      {hint ? <span className={styles.metricHint}>{hint}</span> : null}
    </>
  );
  const className = `${styles.kpi} ${styles[`tone_${tone}`]}`;
  return to ? (
    <Link to={to} className={`${className} ${styles.kpiLink}`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Faixa de aviso para o que precisa de ação agora. */
export function Callout({ tone = 'warn', children, action }: { tone?: Tone; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`${styles.callout} ${styles[`tone_${tone}`]}`} role="status">
      <span>{children}</span>
      {action}
    </div>
  );
}

/** Limite de "estoque baixo" definido em Configurações (padrão 5). */
export function useLowStockThreshold() {
  const key = useAdminKey();
  const settings = useQuery({ queryKey: key('settings'), queryFn: adminApi.settings, staleTime: 5 * 60_000 });
  return settings.data?.lowStockThreshold ?? 5;
}

export type StockLevel = 'out' | 'low' | 'ok';
export const stockLevel = (stock: number, threshold: number): StockLevel => (stock <= 0 ? 'out' : stock <= threshold ? 'low' : 'ok');
const stockText: Record<StockLevel, string> = { out: 'Esgotado', low: 'Baixo', ok: 'OK' };

/** Saldo com cor: vermelho esgotado, âmbar baixo, verde ok. */
export function StockBadge({ stock, threshold, compact }: { stock: number; threshold: number; compact?: boolean }) {
  const level = stockLevel(stock, threshold);
  return (
    <span className={`${styles.stock} ${styles[`stock_${level}`]}`} title={`${stock} em estoque · alerta a partir de ${threshold} ou menos`}>
      <strong>{stock}</strong>
      {compact ? null : <span>{stockText[level]}</span>}
    </span>
  );
}

/** Miniatura do produto (primeira foto) para identificar sem ler o nome. */
export function Thumb({ url, alt, size = 44 }: { url: string | null | undefined; alt: string; size?: number }) {
  return url ? (
    <img className={styles.thumb} src={url} alt={alt} width={size} height={size} loading="lazy" decoding="async" style={{ width: size, height: size }} />
  ) : (
    <span className={styles.thumb} style={{ width: size, height: size }} aria-hidden="true" />
  );
}
