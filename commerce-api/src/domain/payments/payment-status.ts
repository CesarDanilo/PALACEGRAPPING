export const PAYMENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['PIX', 'CARD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Estados finais não voltam atrás; APPROVED só pode virar REFUNDED.
// Notificações fora de ordem (ex.: "pending" chegando depois de "approved") são ignoradas.
const transitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
  // Cartão recusado pode ser aprovado numa nova tentativa dentro do mesmo checkout.
  REJECTED: ['APPROVED', 'CANCELLED', 'EXPIRED'],
  APPROVED: ['REFUNDED'],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
};

export function canMovePayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return transitions[from].includes(to);
}
