import { AppError } from '../../shared/errors.js';

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'EXPIRED',
  'RETURNED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Máquina de estados do pedido.
//
//   PENDING_PAYMENT ─▶ PAID ─▶ PREPARING ─▶ SHIPPED ─▶ DELIVERED ─▶ RETURNED
//         │              │          │                      │
//         ├─▶ EXPIRED    └─▶ CANCELLED ◀┘                  └─▶ RETURNED
//         └─▶ CANCELLED
//
// PAID só é alcançado por confirmação do provedor de pagamento (webhook ou consulta),
// nunca por chamada administrativa comum nem por redirecionamento do navegador.
const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED', 'EXPIRED'],
  PAID: ['PREPARING', 'CANCELLED'],
  PREPARING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  EXPIRED: [],
  RETURNED: [],
};

/** Transições que um usuário administrativo pode pedir diretamente. */
export const MANUAL_TRANSITIONS: ReadonlySet<OrderStatus> = new Set([
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
]);

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError('INVALID_STATE_TRANSITION', `Pedido não pode passar de ${from} para ${to}`, { from, to });
  }
}

/**
 * Regra de estoque: as unidades saem do estoque quando o pedido é criado
 * (validação + baixa atômica no checkout). Voltam ao estoque quando o pedido
 * é cancelado ou expira antes do envio. Após o envio, só uma devolução
 * (RETURNED) com conferência física reintegra as unidades.
 */
export function releasesStock(from: OrderStatus, to: OrderStatus): boolean {
  const beforeShipping: OrderStatus[] = ['PENDING_PAYMENT', 'PAID', 'PREPARING'];
  return (to === 'CANCELLED' || to === 'EXPIRED') && beforeShipping.includes(from);
}

/** Estados em que o pedido conta como venda registrada (receita de vendas). */
export function countsAsSale(status: OrderStatus): boolean {
  return ['PAID', 'PREPARING', 'SHIPPED', 'DELIVERED'].includes(status);
}
