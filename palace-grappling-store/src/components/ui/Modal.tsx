import { useEffect, useId, useRef, type ReactNode } from 'react';
import { CloseIcon } from '@/components/icons';
import styles from './ui.module.css';

/**
 * Modal acessível sobre <dialog> nativo: foco preso, Esc fecha, foco volta ao
 * elemento que abriu. Em ambientes sem showModal (testes), cai para `open`.
 */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.modal}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className={styles.modalBody}>
        <header className={styles.modalHeader}>
          <h2 id={titleId} className={styles.modalTitle}>
            {title}
          </h2>
          <button type="button" className={styles.modalClose} aria-label="Fechar" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
