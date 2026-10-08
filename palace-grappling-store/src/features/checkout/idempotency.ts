// Uma chave de idempotência por tentativa de compra: cliques repetidos, recarregar a
// página ou repetir após falha de rede reutilizam a mesma chave, e a API devolve o
// mesmo pedido em vez de criar outro. Mudar o carrinho gera uma tentativa nova.

const KEY = 'pg.checkout.attempt';

export function checkoutAttemptKey(items: { variantId: string; quantity: number }[]): string {
  const signature = JSON.stringify([...items].sort((a, b) => a.variantId.localeCompare(b.variantId)));
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { signature: string; key: string } | null;
    if (saved?.signature === signature) return saved.key;
    const key = crypto.randomUUID();
    sessionStorage.setItem(KEY, JSON.stringify({ signature, key }));
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

export function clearCheckoutAttempt() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
