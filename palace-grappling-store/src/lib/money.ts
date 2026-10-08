// A API trafega dinheiro em centavos inteiros. Esta é a única conversão para exibição.

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(cents: number, currency = 'BRL'): string {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', { style: 'currency', currency });
    formatters.set(currency, f);
  }
  return f.format(cents / 100);
}

/** "199,90" → 19990. Para formulários administrativos. */
export function parseMoneyInput(text: string): number | null {
  const normalized = text.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole = '0', frac = ''] = normalized.replace('-', '').split('.');
  const value = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return normalized.startsWith('-') ? -value : value;
}
