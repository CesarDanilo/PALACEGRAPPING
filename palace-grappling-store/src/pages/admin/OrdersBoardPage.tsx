import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import { adminApi, type AdminOrder } from '@/lib/api/admin';
import type { OrderStatus } from '@/lib/api/types';
import { PageHeader, errorMessage, money, orderStatusText, useAdminKey } from './common';
import styles from './admin.module.css';

/** Colunas do fluxo, na ordem em que o pedido anda. */
const FLOW: { status: OrderStatus; hint: string; tone: string }[] = [
  { status: 'PENDING_PAYMENT', hint: 'Esperando o cliente pagar', tone: 'warn' },
  { status: 'PAID', hint: 'Separar as peças', tone: 'info' },
  { status: 'PREPARING', hint: 'Embalar e enviar', tone: 'info' },
  { status: 'SHIPPED', hint: 'A caminho do cliente', tone: 'accent' },
  { status: 'DELIVERED', hint: 'Concluídos', tone: 'success' },
];
/** Encerrados: aparecem resumidos, sem arrastar para dentro (exceto cancelar/devolver). */
const CLOSED: OrderStatus[] = ['CANCELLED', 'EXPIRED', 'RETURNED'];

/** Para onde cada etapa pode ir (as mesmas regras da API). */
const MOVES: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['PREPARING', 'CANCELLED'],
  PREPARING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
};
const DANGER: OrderStatus[] = ['CANCELLED', 'RETURNED'];
const label = (s: OrderStatus) => orderStatusText[s];

function age(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

/** Quadro (Kanban) para acompanhar os pedidos por etapa. Arraste o card para a próxima etapa. */
export function OrdersBoardPage() {
  const key = useAdminKey();
  const queryClient = useQueryClient();
  const { can } = useAdminSession();
  const writable = can('orders:write');
  const canPay = writable && can('finance:write');
  const statuses = [...FLOW.map((c) => c.status), ...CLOSED];
  const results = useQueries({
    queries: statuses.map((status) => ({
      queryKey: key('board', status),
      queryFn: () => adminApi.orders({ status, page: 1, pageSize: CLOSED.includes(status) ? 10 : 100 }),
      refetchInterval: 60_000,
    })),
  });
  const byStatus = Object.fromEntries(statuses.map((s, i) => [s, results[i]])) as Record<OrderStatus, (typeof results)[number]>;

  const [dragging, setDraggingState] = useState<AdminOrder | null>(null);
  // O dragover acontece antes do novo render: a ref evita ler o card arrastado desatualizado.
  const draggingRef = useRef<AdminOrder | null>(null);
  const setDragging = (o: AdminOrder | null) => {
    draggingRef.current = o;
    setDraggingState(o);
  };
  const [over, setOver] = useState<OrderStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paying, setPaying] = useState<AdminOrder | null>(null);

  const move = async (order: AdminOrder, to: OrderStatus) => {
    if (!(MOVES[order.status] ?? []).includes(to)) return;
    if (to === 'PAID') {
      if (canPay) setPaying(order);
      else setError('Só proprietário ou administrador confirma pagamento.');
      return;
    }
    if (DANGER.includes(to) && !window.confirm(`${label(to)}: pedido ${order.number}? ${to === 'CANCELLED' ? 'As peças voltam ao estoque.' : 'A devolução não reintegra o estoque automaticamente; confira na página do pedido.'}`)) return;
    setBusy(order.id);
    setError(null);
    try {
      await adminApi.changeStatus(order.id, { status: to });
      setNotice(`Pedido ${order.number}: ${label(to)}.`);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const allowed = (target: OrderStatus) => {
    const d = draggingRef.current ?? dragging;
    return Boolean(d && (MOVES[d.status] ?? []).includes(target));
  };
  const dropProps = (target: OrderStatus) => ({
    onDragOver: (e: DragEvent) => {
      if (!allowed(target)) return;
      e.preventDefault();
      setOver(target);
    },
    onDragLeave: () => setOver((cur) => (cur === target ? null : cur)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(null);
      const d = draggingRef.current;
      if (d) void move(d, target);
      setDragging(null);
    },
  });

  return (
    <div className={styles.page}>
      <PageHeader
        title="Quadro de pedidos"
        description="Arraste o card para a próxima etapa, ou use “Mover para”. Atualiza sozinho a cada minuto."
        actions={
          <>
            <Link to="/admin/pedidos" className={styles.linkButton}>
              Ver lista
            </Link>
            {writable ? (
              <Link to="/admin/pedidos/novo" className={styles.linkButton}>
                Novo pedido
              </Link>
            ) : null}
          </>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice && !error ? <Alert tone="success">{notice}</Alert> : null}

      <div className={styles.board}>
        {FLOW.map((col) => {
          const q = byStatus[col.status];
          const orders = q.data?.items ?? [];
          const total = q.data?.total ?? 0;
          const sum = orders.reduce((s, o) => s + o.total, 0);
          return (
            <section
              key={col.status}
              className={`${styles.boardCol} ${styles[`boardTone_${col.tone}`]} ${over === col.status ? styles.boardOver : ''} ${dragging && !allowed(col.status) && dragging.status !== col.status ? styles.boardBlocked : ''}`}
              aria-label={`${label(col.status)}: ${total} pedidos`}
              {...dropProps(col.status)}
            >
              <header className={styles.boardHead}>
                <span>
                  <strong>{label(col.status)}</strong>
                  <span className={styles.muted}>{col.hint}</span>
                </span>
                <span className={styles.boardCount}>{total}</span>
              </header>
              {orders.length ? <p className={styles.boardSum}>{money(sum)}</p> : null}
              <ul className={styles.boardList}>
                {q.isPending ? <li className={styles.muted}>Carregando…</li> : null}
                {!q.isPending && !orders.length ? <li className={styles.boardEmpty}>Nenhum pedido</li> : null}
                {orders.map((o) => (
                  <BoardCard key={o.id} order={o} busy={busy === o.id} writable={writable} onMove={move} onDragStart={() => setDragging(o)} onDragEnd={() => { setDragging(null); setOver(null); }} />
                ))}
                {total > orders.length ? <li className={styles.muted}>+ {total - orders.length} na lista</li> : null}
              </ul>
            </section>
          );
        })}
      </div>

      <section className={styles.boardClosed} aria-label="Encerrados">
        {CLOSED.map((status) => {
          const q = byStatus[status];
          return (
            <div key={status} className={`${styles.boardClosedCol} ${over === status ? styles.boardOver : ''}`} {...dropProps(status)}>
              <header className={styles.boardHead}>
                <strong>{label(status)}</strong>
                <span className={styles.boardCount}>{q.data?.total ?? 0}</span>
              </header>
              <ul className={styles.boardMini}>
                {(q.data?.items ?? []).map((o) => (
                  <li key={o.id}>
                    <Link to={`/admin/pedidos/${o.id}`} className={styles.code}>
                      {o.number}
                    </Link>{' '}
                    <span className={styles.muted}>
                      {o.customerName} · {money(o.total)}
                    </span>
                  </li>
                ))}
              </ul>
              {(q.data?.total ?? 0) > 10 ? (
                <Link to={`/admin/pedidos?status=${status}`} className={styles.muted}>
                  Ver todos
                </Link>
              ) : null}
            </div>
          );
        })}
      </section>

      {paying ? <PaymentDialog order={paying} onClose={() => setPaying(null)} onDone={(n) => { setPaying(null); setNotice(n); void queryClient.invalidateQueries({ queryKey: ['admin'] }); }} /> : null}
    </div>
  );
}

function BoardCard({
  order,
  busy,
  writable,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  order: AdminOrder;
  busy: boolean;
  writable: boolean;
  onMove: (o: AdminOrder, to: OrderStatus) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const targets = MOVES[order.status] ?? [];
  const units = order.items.reduce((s, i) => s + i.quantity, 0);
  return (
    <li
      className={`${styles.boardCard} ${busy ? styles.boardBusy : ''}`}
      draggable={writable && targets.length > 0}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', order.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className={styles.boardCardTop}>
        <Link to={`/admin/pedidos/${order.id}`} className={styles.code}>
          {order.number}
        </Link>
        <strong>{money(order.total)}</strong>
      </div>
      <span className={styles.boardCustomer}>{order.customerName}</span>
      <span className={styles.muted}>
        {units} {units === 1 ? 'peça' : 'peças'} · {age(order.createdAt)}
        {order.source === 'ADMIN' ? ' · Painel' : order.source === 'CATALOG_LINK' ? ' · Link' : ''}
      </span>
      {writable && targets.length ? (
        <label className={styles.boardMove}>
          <span className="visually-hidden">Mover pedido {order.number} para</span>
          <select
            value=""
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) onMove(order, e.target.value as OrderStatus);
            }}
          >
            <option value="">Mover para…</option>
            {targets.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </li>
  );
}

/** Confirmação de pagamento recebido por fora (Pix direto, dinheiro), com observação obrigatória. */
function PaymentDialog({ order, onClose, onDone }: { order: AdminOrder; onClose: () => void; onDone: (notice: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const valid = note.trim().length >= 3;
  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-labelledby="pay-title">
      <form
        method="dialog"
        className={styles.page}
        style={{ gap: 'var(--space-4)' }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setSaving(true);
          try {
            await adminApi.confirmPayment(order.id, note.trim());
            onDone(`Pedido ${order.number}: pagamento confirmado.`);
          } catch (err) {
            setError(errorMessage(err));
            setSaving(false);
          }
        }}
      >
        <h2 id="pay-title" className={styles.panelTitle}>
          Confirmar pagamento do pedido {order.number}
        </h2>
        <p className={styles.muted}>
          {money(order.total)} · {order.customerName}. O pedido vai para Pago e a receita entra no Financeiro.
        </p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className={styles.field}>
          <label htmlFor="board-pay-note">Como foi pago (obrigatório)</label>
          <input id="board-pay-note" maxLength={500} autoFocus placeholder="Ex.: Pix recebido, comprovante no WhatsApp" value={note} onChange={(e) => setNote(e.target.value)} />
          {note.length > 0 && !valid ? <p className={styles.fieldError}>Descreva como o pagamento foi recebido</p> : null}
        </div>
        <div className={styles.actions}>
          <Button size="sm" type="submit" loading={saving} disabled={!valid}>
            Confirmar pagamento
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => ref.current?.close()}>
            Cancelar
          </Button>
        </div>
      </form>
    </dialog>
  );
}
