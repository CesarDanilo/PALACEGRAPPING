// Dinheiro é representado em centavos inteiros dentro da aplicação.
// No banco é Decimal(12,2); a conversão acontece apenas nas bordas
// (repositórios e serialização HTTP). Nunca some reais com Number.

export type Cents = number & { readonly __brand: 'Cents' };

const MAX_CENTS = 999_999_999_999; // limite de Decimal(12,2)

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Valor em centavos inválido: ${value}`);
  if (Math.abs(value) > MAX_CENTS) throw new RangeError('Valor monetário fora do limite');
  return value as Cents;
}

/** Converte "123.45" (ou um Decimal via toString) para centavos sem ponto flutuante. */
export function parseDecimal(value: string | { toString(): string }): Cents {
  const text = value.toString().trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,2})0*)?$/.exec(text);
  if (!match) throw new RangeError(`Decimal inválido (máximo de 2 casas): ${text}`);
  const [, sign, whole = '0', frac = ''] = match;
  const total = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return cents(sign ? -total : total);
}

/** Centavos para string decimal "123.45" (aceita pelo Prisma Decimal e usada na API). */
export function toDecimalString(value: Cents): string {
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${value < 0 ? '-' : ''}${whole}.${frac}`;
}

export function sum(values: Cents[]): Cents {
  return cents(values.reduce((total, v) => total + v, 0));
}

export function multiply(value: Cents, quantity: number): Cents {
  if (!Number.isInteger(quantity)) throw new RangeError('Quantidade deve ser inteira');
  return cents(value * quantity);
}

export const ZERO = cents(0);
