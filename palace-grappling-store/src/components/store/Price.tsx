import { formatMoney } from '@/lib/money';
import styles from './store.module.css';

/** Preço com faixa ("a partir de") e preço cheio riscado quando há promoção. */
export function Price({ min, max, compareAt, size = 'sm' }: { min: number; max?: number; compareAt?: number | null; size?: 'sm' | 'lg' }) {
  const ranged = max != null && max !== min;
  const sale = compareAt != null && compareAt > min;
  return (
    <span className={`${styles.price} ${size === 'lg' ? styles.priceLg : ''}`}>
      {ranged ? <span className={styles.priceFrom}>a partir de </span> : null}
      <span className={sale ? styles.priceSale : undefined}>{formatMoney(min)}</span>
      {sale ? (
        <s className={styles.priceWas}>
          <span className="visually-hidden">Preço anterior: </span>
          {formatMoney(compareAt)}
        </s>
      ) : null}
    </span>
  );
}
