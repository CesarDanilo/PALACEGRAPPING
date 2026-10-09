import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { adminApi } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/client';
import { UFS, emailSchema, fullNameSchema, phoneSchema, zipCodeSchema } from '@/lib/validation';
import { z } from '@/lib/zod';
import { Panel, errorMessage, useAdminMutation } from './common';
import styles from './admin.module.css';

const customerSchema = z
  .object({
    name: fullNameSchema,
    phone: phoneSchema,
    email: z.union([z.literal(''), emailSchema]),
    withAddress: z.boolean(),
    zipCode: z.string().max(12, 'CEP inválido'),
    street: z.string().trim().max(160, 'Máximo de 160 caracteres'),
    number: z.string().trim().max(20, 'Máximo de 20 caracteres'),
    complement: z.string().trim().max(80, 'Máximo de 80 caracteres'),
    district: z.string().trim().max(80, 'Máximo de 80 caracteres'),
    city: z.string().trim().max(80, 'Máximo de 80 caracteres'),
    state: z.enum(UFS),
  })
  .superRefine((v, ctx) => {
    if (!v.withAddress) return;
    if (!zipCodeSchema.safeParse(v.zipCode).success) ctx.addIssue({ code: 'custom', path: ['zipCode'], message: 'CEP com 8 dígitos' });
    if (v.street.length < 2) ctx.addIssue({ code: 'custom', path: ['street'], message: 'Informe a rua' });
    if (!v.number) ctx.addIssue({ code: 'custom', path: ['number'], message: 'Informe o número' });
    if (v.district.length < 2) ctx.addIssue({ code: 'custom', path: ['district'], message: 'Informe o bairro' });
    if (v.city.length < 2) ctx.addIssue({ code: 'custom', path: ['city'], message: 'Informe a cidade' });
  });
type CustomerFormIn = z.input<typeof customerSchema>;
type CustomerFormOut = z.output<typeof customerSchema>;

const blank: CustomerFormIn = { name: '', phone: '', email: '', withAddress: false, zipCode: '', street: '', number: '', complement: '', district: '', city: '', state: 'SP' };

/** Cadastro manual de cliente (quem comprou por fora). O telefone identifica o cliente na loja. */
export function NewCustomerPanel({ onClose }: { onClose: () => void }) {
  const form = useForm<CustomerFormIn, unknown, CustomerFormOut>({ resolver: zodResolver(customerSchema), defaultValues: blank });
  const e = form.formState.errors;
  const withAddress = form.watch('withAddress');
  const save = useAdminMutation(
    (v: CustomerFormOut) =>
      adminApi.createCustomer({
        name: v.name,
        phone: v.phone,
        email: v.email || null,
        address: v.withAddress
          ? { zipCode: v.zipCode.replace(/\D/g, ''), street: v.street, number: v.number, complement: v.complement || null, district: v.district, city: v.city, state: v.state }
          : null,
      }),
    () => form.reset(blank),
  );
  const existingId = save.error instanceof ApiError && save.error.code === 'CONFLICT' ? (save.error.details as { customerId?: string } | undefined)?.customerId : undefined;

  const text = (id: keyof CustomerFormIn, label: string, max: number, extra: Record<string, unknown> = {}) => (
    <div className={styles.field}>
      <label htmlFor={`nc-${id}`}>{label}</label>
      <input id={`nc-${id}`} maxLength={max} aria-invalid={e[id] ? true : undefined} {...extra} {...form.register(id)} />
      {e[id] ? <p className={styles.fieldError}>{e[id]?.message}</p> : null}
    </div>
  );

  return (
    <Panel title="Novo cliente" actions={<button type="button" className={styles.linkButton} onClick={onClose}>Fechar</button>}>
      {save.isSuccess ? (
        <Alert tone="success">
          Cliente cadastrado. <Link to={`/admin/clientes/${save.data.customer.id}`}>Abrir ficha</Link>
        </Alert>
      ) : null}
      {save.isError ? (
        <Alert tone="danger">
          {errorMessage(save.error)} {existingId ? <Link to={`/admin/clientes/${existingId}`}>Ver cliente</Link> : null}
        </Alert>
      ) : null}
      <form className={styles.formGrid} noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))}>
        {text('name', 'Nome completo', 120, { autoComplete: 'off' })}
        {text('phone', 'Telefone (WhatsApp)', 25, { type: 'tel', inputMode: 'tel', autoComplete: 'off' })}
        {text('email', 'E-mail (opcional)', 254, { type: 'email', inputMode: 'email', autoComplete: 'off' })}
        <label className={`${styles.check} ${styles.span2}`}>
          <input type="checkbox" {...form.register('withAddress')} /> Cadastrar endereço de entrega
        </label>
        {withAddress ? (
          <>
            {text('zipCode', 'CEP', 12, { inputMode: 'numeric' })}
            <div className={styles.field}>
              <label htmlFor="nc-state">Estado</label>
              <select id="nc-state" {...form.register('state')}>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
            {text('street', 'Rua', 160)}
            {text('number', 'Número', 20)}
            {text('complement', 'Complemento (opcional)', 80)}
            {text('district', 'Bairro', 80)}
            {text('city', 'Cidade', 80)}
          </>
        ) : null}
        <div className={styles.span2}>
          <Button size="sm" type="submit" loading={save.isPending}>
            Cadastrar cliente
          </Button>
        </div>
      </form>
    </Panel>
  );
}
