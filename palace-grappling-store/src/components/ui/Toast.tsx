import { useEffect, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { CheckIcon } from '@/components/icons';
import styles from './ui.module.css';

// Avisos curtos e não bloqueantes (ex.: "adicionado ao carrinho"), anunciados por leitores de tela.

interface ToastState {
  id: number;
  message: string;
  link?: { to: string; label: string };
}

let current: ToastState | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function notify(message: string, link?: ToastState['link']) {
  current = { id: ++seq, message, link };
  emit();
}

function dismiss(id: number) {
  if (current?.id === id) {
    current = null;
    emit();
  }
}

export function ToastHost() {
  const toast = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
    () => null,
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => dismiss(toast.id), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div aria-live="polite" role="status">
      {toast ? (
        <div className={styles.toast}>
          <CheckIcon size={18} />
          <span>{toast.message}</span>
          {toast.link ? <Link to={toast.link.to}>{toast.link.label}</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
