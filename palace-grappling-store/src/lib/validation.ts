import { z } from '@/lib/zod';

// Regras de validação usadas nos formulários. Espelham as da API
// (commerce-api/src/shared/validation.ts) para o erro aparecer no campo antes do
// envio; a API valida tudo de novo e é ela quem decide.

const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63,
  64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** Telefone brasileiro: DDD válido + 8 dígitos (fixo, 2–5) ou 9 dígitos (celular, 9). Aceita +55. */
export function normalizeBrazilianPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) return null;
  if (!DDDS.has(Number(digits.slice(0, 2)))) return null;
  const local = digits.slice(2);
  if (local.length === 9 && !local.startsWith('9')) return null;
  if (local.length === 8 && !/^[2-5]/.test(local)) return null;
  return digits;
}

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;

export const phoneSchema = z
  .string()
  .max(25, 'Telefone inválido')
  .transform((v, ctx) => {
    const phone = normalizeBrazilianPhone(v);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Telefone com DDD válido (ex.: 11 98888-7777)' });
      return z.NEVER;
    }
    return phone;
  });

export const zipCodeSchema = z
  .string()
  .max(12, 'CEP inválido')
  .transform((v) => v.replace(/\D/g, ''))
  .pipe(z.string().regex(/^\d{8}$/, 'CEP com 8 dígitos'));

export const fullNameSchema = z
  .string()
  .trim()
  .min(3, 'Informe nome e sobrenome')
  .max(120, 'Máximo de 120 caracteres')
  .regex(/^\S+(\s+\S+)+$/, 'Informe nome e sobrenome')
  .refine((v) => !/[<>]/.test(v), 'Caracteres inválidos no nome');

export const emailSchema = z.email('E-mail inválido').max(254, 'E-mail muito longo');

export const skuSchema = z
  .string()
  .trim()
  .min(1, 'Informe o SKU')
  .max(64, 'Máximo de 64 caracteres')
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Letras, números, ponto, hífen ou sublinhado');

export const passwordSchema = z
  .string()
  .min(12, 'Pelo menos 12 caracteres')
  .max(128, 'No máximo 128 caracteres')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Use letras e números');

/** Valor em centavos: inteiro, não negativo e finito. */
export const centsSchema = z
  .number({ error: 'Informe um valor' })
  .int('Valor inválido')
  .min(0, 'O valor não pode ser negativo')
  .max(999_999_999_999, 'Valor muito alto');

/** Quantidade de estoque: inteiro de 0 a 1.000.000. */
export const stockSchema = z
  .number({ error: 'Informe um número' })
  .int('Use um número inteiro')
  .min(0, 'Não pode ser negativo')
  .max(1_000_000, 'Máximo de 1.000.000');

/** Converte o valor de um <input type="number"> (string) em número; vazio vira NaN para a validação acusar. */
export const toNumber = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));
