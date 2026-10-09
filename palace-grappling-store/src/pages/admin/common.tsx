import { useMutation, useQueryClient } from '@tanstack/react-query';
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import { ApiError } from '@/lib/api/client';
import type { OrderStatus } from '@/lib/api/types';
import { formatMoney, parseMoneyInput } from '@/lib/money';
import styles from './admin.module.css';

/** Chave de cache por loja: trocar de loja nunca mostra dados da anterior. */
export function useAdminKey() {
  const { membership } = useAdminSession();
  return (...parts: unknown[]) => ['admin', membership?.tenant.id, ...parts];
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const issues = (error.details as { issues?: { path: string; message: string }[] } | undefined)?.issues;
    return issues?.length ? `${error.message}: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}` : error.message;
  }
  return 'Não foi possível concluir. Tente novamente.';
}

/** Mutação administrativa: invalida o cache da loja ao concluir. */
export function useAdminMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>, onSuccess?: (result: TResult) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      onSuccess?.(result);
    },
  });
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1 className={styles.pageTitle}>{title}</h1>
        {description ? <p className={styles.muted}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

export function Panel({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  const id = useId();
  return (
    <section className={styles.panel} aria-labelledby={title ? id : undefined}>
      {title ? (
        <div className={styles.panelHead}>
          <h2 id={id} className={styles.panelTitle}>
            {title}
          </h2>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

interface MoneyFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  label: string;
  value: number | null;
  onChange: (cents: number | null) => void;
  error?: string;
  optional?: boolean;
}

/** Campo de valor em reais ("199,90") que entrega centavos inteiros. */
export const MoneyField = forwardRef<HTMLInputElement, MoneyFieldProps>(function MoneyField({ label, value, onChange, error, optional, ...rest }, ref) {
  const id = useId();
  const [text, setText] = useState(value == null ? '' : (value / 100).toFixed(2).replace('.', ','));
  const [invalid, setInvalid] = useState(false);
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.money}>
        <span aria-hidden="true">R$</span>
        <input
          ref={ref}
          id={id}
          inputMode="decimal"
          value={text}
          aria-invalid={invalid || error ? true : undefined}
          onChange={(e) => {
            setText(e.target.value);
            if (!e.target.value.trim() && optional) {
              setInvalid(false);
              onChange(null);
              return;
            }
            const cents = parseMoneyInput(e.target.value);
            setInvalid(cents == null || cents < 0);
            if (cents != null && cents >= 0) onChange(cents);
          }}
          {...rest}
        />
      </div>
      {invalid ? <p className={styles.fieldError}>Use o formato 199,90</p> : error ? <p className={styles.fieldError}>{error}</p> : null}
    </div>
  );
});

export const orderStatusText: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  PAID: 'Pago',
  PREPARING: 'Em preparação',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Expirado',
  RETURNED: 'Devolvido',
};

const statusTone: Record<string, string> = {
  PENDING_PAYMENT: 'warn',
  PENDING: 'warn',
  PAID: 'ok',
  APPROVED: 'ok',
  PREPARING: 'info',
  SHIPPED: 'info',
  DELIVERED: 'ok',
  CANCELLED: 'bad',
  EXPIRED: 'bad',
  REJECTED: 'bad',
  RETURNED: 'bad',
  REFUNDED: 'bad',
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <span className={`${styles.pill} ${styles[`pill_${statusTone[status] ?? 'info'}`]}`}>{label ?? orderStatusText[status as OrderStatus] ?? status}</span>;
}

export const money = (cents: number | null | undefined) => (cents == null ? '—' : formatMoney(cents));
export const dateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');

export function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav className={styles.pager} aria-label="Paginação">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </button>
      <span>
        Página {page} de {totalPages}
      </span>
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Próxima
      </button>
    </nav>
  );
}
