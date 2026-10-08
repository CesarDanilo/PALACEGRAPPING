import { z } from 'zod';

const digits = (v: string) => v.replace(/\D/g, '');

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;

/**
 * Validação do formulário de checkout no navegador. É apenas conveniência para o
 * comprador: a API valida tudo de novo e recalcula preços e estoque.
 */
export const checkoutSchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo').max(120),
  phone: z
    .string()
    .transform(digits)
    .pipe(z.string().min(10, 'Telefone com DDD').max(11, 'Telefone inválido')),
  email: z.union([z.literal(''), z.email('E-mail inválido')]),
  zipCode: z.string().transform(digits).pipe(z.string().length(8, 'CEP com 8 dígitos')),
  street: z.string().trim().min(2, 'Informe a rua').max(160),
  number: z.string().trim().min(1, 'Informe o número').max(20),
  complement: z.string().trim().max(80),
  district: z.string().trim().min(2, 'Informe o bairro').max(80),
  city: z.string().trim().min(2, 'Informe a cidade').max(80),
  state: z.enum(UFS, 'Selecione o estado'),
  paymentMethod: z.enum(['PIX', 'CARD']),
  notes: z.string().trim().max(500),
  acceptTerms: z.boolean().refine((v) => v, 'Aceite os termos para continuar'),
});

export type CheckoutForm = z.input<typeof checkoutSchema>;
export type CheckoutValues = z.output<typeof checkoutSchema>;

export const checkoutDefaults: CheckoutForm = {
  name: '',
  phone: '',
  email: '',
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: 'SP',
  paymentMethod: 'PIX',
  notes: '',
  acceptTerms: false,
};
