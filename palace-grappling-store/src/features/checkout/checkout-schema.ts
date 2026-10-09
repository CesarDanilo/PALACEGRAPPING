import { z } from '@/lib/zod';
import { UFS, emailSchema, fullNameSchema, phoneSchema, zipCodeSchema } from '@/lib/validation';

export { UFS };

/**
 * Validação do formulário de checkout no navegador. É apenas conveniência para o
 * comprador: a API valida tudo de novo e recalcula preços e estoque.
 */
export const checkoutSchema = z.object({
  name: fullNameSchema,
  phone: phoneSchema,
  email: z.union([z.literal(''), emailSchema]),
  zipCode: zipCodeSchema,
  street: z.string().trim().min(2, 'Informe a rua').max(160, 'Máximo de 160 caracteres'),
  number: z.string().trim().min(1, 'Informe o número').max(20, 'Máximo de 20 caracteres'),
  complement: z.string().trim().max(80, 'Máximo de 80 caracteres'),
  district: z.string().trim().min(2, 'Informe o bairro').max(80, 'Máximo de 80 caracteres'),
  city: z.string().trim().min(2, 'Informe a cidade').max(80, 'Máximo de 80 caracteres'),
  state: z.enum(UFS, 'Selecione o estado'),
  paymentMethod: z.enum(['PIX', 'CARD']),
  notes: z.string().trim().max(500, 'Máximo de 500 caracteres'),
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
