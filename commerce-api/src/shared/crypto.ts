import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Token opaco aleatório (base64url). 32 bytes = 256 bits de entropia. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSha256Hex(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Alfabeto sem caracteres ambíguos (0/O, 1/I/L) para números de pedido legíveis.
const ORDER_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Número público de pedido não sequencial, ex.: "7KQ2-9XMB" (31^8 ≈ 8,5e11 combinações). */
export function orderNumber(prefix = ''): string {
  let code = '';
  for (const byte of randomBytes(8)) code += ORDER_ALPHABET[byte % ORDER_ALPHABET.length];
  return `${prefix}${code.slice(0, 4)}-${code.slice(4)}`;
}
