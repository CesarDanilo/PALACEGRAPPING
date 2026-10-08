// Tokens de acompanhamento ficam no armazenamento local do navegador do comprador,
// indexados pelo número do pedido. Nunca vão para a URL.

const KEY = 'pg.orders.v1';

function readAll(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveTrackingToken(orderNumber: string, token: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [orderNumber]: token }));
  } catch {
    /* armazenamento indisponível */
  }
}

export function readTrackingToken(orderNumber: string): string | null {
  return readAll()[orderNumber] ?? null;
}
