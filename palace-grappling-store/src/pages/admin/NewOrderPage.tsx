import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { MinusIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Alert, LoadingState } from '@/components/ui/Feedback';
import { adminApi, type AdminProduct, type AdminVariant, type Customer } from '@/lib/api/admin';
import { storefrontApi } from '@/lib/api/storefront';
import { UFS, emailSchema, fullNameSchema, phoneSchema, zipCodeSchema } from '@/lib/validation';
import { z } from '@/lib/zod';
import { PageHeader, Panel, errorMessage, money, useAdminKey, useAdminMutation } from './common';
import { StockBadge, Thumb, useLowStockThreshold } from './highlights';
import { SearchField, coverOf, filterProducts, useAllProducts } from './product-search';
import styles from './admin.module.css';

const MAX_UNITS = 100;
const MAX_LINES = 50;

const orderSchema = z
  .object({
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
    paid: z.boolean(),
    paymentNote: z.string().trim().max(500, 'Máximo de 500 caracteres'),
  })
  .refine((v) => !v.paid || v.paymentNote.length >= 3, { path: ['paymentNote'], message: 'Descreva como o pagamento foi recebido' });
type OrderFormIn = z.input<typeof orderSchema>;
type OrderFormOut = z.output<typeof orderSchema>;

interface Line {
  product: AdminProduct;
  variant: AdminVariant;
  quantity: number;
}
const variantName = (v: AdminVariant) => [v.size, v.color].filter(Boolean).join(' · ') || v.sku;
const unitPriceOf = (p: AdminProduct, v: AdminVariant) => v.salePrice ?? v.price ?? p.salePrice ?? p.price;

/** Lançar pedido pelo painel (WhatsApp, balcão, telefone). O servidor recalcula preço, frete e estoque. */
export function NewOrderPage() {
  const navigate = useNavigate();
  const threshold = useLowStockThreshold();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [lines, setLines] = useState<Line[]>([]);
  const [lineError, setLineError] = useState<string | null>(null);
  const form = useForm<OrderFormIn, unknown, OrderFormOut>({
    resolver: zodResolver(orderSchema),
    defaultValues: { name: '', phone: '', email: '', zipCode: '', street: '', number: '', complement: '', district: '', city: '', state: 'SP', paymentMethod: 'PIX', notes: '', paid: false, paymentNote: '' },
  });
  const e = form.formState.errors;
  const paid = form.watch('paid');
  const zip = form.watch('zipCode');
  const units = lines.reduce((s, l) => s + l.quantity, 0);

  // Prévia com as regras do servidor (preço, frete da loja, disponibilidade).
  const zipDigits = zip.replace(/\D/g, '');
  const quote = useQuery({
    queryKey: ['admin-order-quote', lines.map((l) => [l.variant.id, l.quantity]), zipDigits],
    queryFn: () => storefrontApi.quote(lines.map((l) => ({ variantId: l.variant.id, quantity: l.quantity })), { kind: 'storefront' }, zipDigits.length === 8 ? zipDigits : null),
    enabled: lines.length > 0,
  });

  const create = useAdminMutation(
    (v: OrderFormOut) =>
      adminApi.createOrder(
        {
          customer: { name: v.name, phone: v.phone, email: v.email || null },
          address: { zipCode: v.zipCode, street: v.street, number: v.number, complement: v.complement || null, district: v.district, city: v.city, state: v.state },
          items: lines.map((l) => ({ variantId: l.variant.id, quantity: l.quantity })),
          paymentMethod: v.paymentMethod,
          notes: v.notes || null,
          paid: v.paid,
          paymentNote: v.paid ? v.paymentNote : null,
        },
        idempotencyKey,
      ),
    (res) => navigate(`/admin/pedidos/${res.order.id}`),
  );

  const addLine = (product: AdminProduct, variant: AdminVariant) => {
    setLineError(null);
    setLines((all) => {
      const found = all.find((l) => l.variant.id === variant.id);
      if (found) return all.map((l) => (l === found ? { ...l, quantity: Math.min(l.quantity + 1, MAX_UNITS) } : l));
      if (all.length >= MAX_LINES) return all;
      return [...all, { product, variant, quantity: 1 }];
    });
  };
  const setQty = (variantId: string, quantity: number) =>
    setLines((all) => all.map((l) => (l.variant.id === variantId ? { ...l, quantity: Math.max(1, Math.min(MAX_UNITS, Math.trunc(quantity) || 1)) } : l)));

  const fillCustomer = (c: Customer, address: OrderFormIn | null) => {
    form.setValue('name', c.name, { shouldValidate: true });
    form.setValue('phone', c.phone, { shouldValidate: true });
    form.setValue('email', c.email ?? '');
    if (address) for (const k of ['zipCode', 'street', 'number', 'complement', 'district', 'city', 'state'] as const) form.setValue(k, address[k], { shouldValidate: true });
  };

  const submit = form.handleSubmit((v) => {
    if (!lines.length) return setLineError('Adicione pelo menos um produto.');
    if (units > MAX_UNITS) return setLineError(`Máximo de ${MAX_UNITS} unidades por pedido.`);
    create.mutate(v);
  });

  const text = (id: keyof OrderFormIn, label: string, max: number, extra: Record<string, unknown> = {}) => (
    <div className={styles.field}>
      <label htmlFor={`no-${id}`}>{label}</label>
      <input id={`no-${id}`} maxLength={max} aria-invalid={e[id] ? true : undefined} {...extra} {...form.register(id)} />
      {e[id] ? <p className={styles.fieldError}>{e[id]?.message}</p> : null}
    </div>
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Novo pedido"
        description="Venda feita por WhatsApp, telefone ou balcão. Preço, frete e estoque são conferidos pelo sistema."
        actions={<Link to="/admin/pedidos" className={styles.linkButton}>Voltar</Link>}
      />
      {create.isError ? <Alert tone="danger">{errorMessage(create.error)}</Alert> : null}

      <form noValidate onSubmit={submit} className={styles.split}>
        <div className={styles.page}>
          <Panel title="1. Produtos">
            <ItemPicker onAdd={addLine} threshold={threshold} />
            {lineError ? <p className={styles.fieldError}>{lineError}</p> : null}
            {lines.length ? (
              <ul className={styles.orderLines} aria-label="Itens do pedido">
                {lines.map((l) => {
                  const over = l.quantity > l.variant.stock;
                  return (
                    <li key={l.variant.id}>
                      <Thumb url={coverOf(l.product)} alt="" size={44} />
                      <span className={styles.orderLineInfo}>
                        <strong>{l.product.name}</strong>
                        <span className={styles.muted}>
                          {variantName(l.variant)} · {money(unitPriceOf(l.product, l.variant))}
                        </span>
                        {over ? <span className={styles.fieldError}>Só {l.variant.stock} em estoque</span> : null}
                      </span>
                      <span className={styles.qty}>
                        <button type="button" aria-label={`Diminuir ${l.product.name}`} disabled={l.quantity <= 1} onClick={() => setQty(l.variant.id, l.quantity - 1)}>
                          <MinusIcon size={16} />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={MAX_UNITS}
                          step={1}
                          aria-label={`Quantidade de ${l.product.name} ${variantName(l.variant)}`}
                          value={l.quantity}
                          onChange={(ev) => setQty(l.variant.id, Number(ev.target.value))}
                        />
                        <button type="button" aria-label={`Aumentar ${l.product.name}`} disabled={l.quantity >= MAX_UNITS} onClick={() => setQty(l.variant.id, l.quantity + 1)}>
                          <PlusIcon size={16} />
                        </button>
                      </span>
                      <button type="button" className={styles.iconOnly} aria-label={`Remover ${l.product.name} ${variantName(l.variant)}`} onClick={() => setLines((all) => all.filter((x) => x !== l))}>
                        <TrashIcon size={18} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.muted}>Busque e clique no tamanho para adicionar.</p>
            )}
          </Panel>

          <Panel title="2. Cliente">
            <CustomerFinder onPick={fillCustomer} />
            <div className={styles.formGrid}>
              {text('name', 'Nome completo', 120, { autoComplete: 'off' })}
              {text('phone', 'Telefone (WhatsApp)', 25, { type: 'tel', inputMode: 'tel', autoComplete: 'off' })}
              {text('email', 'E-mail (opcional)', 254, { type: 'email', inputMode: 'email', autoComplete: 'off' })}
            </div>
          </Panel>

          <Panel title="3. Entrega">
            <div className={styles.formGrid}>
              {text('zipCode', 'CEP', 12, { inputMode: 'numeric' })}
              <div className={styles.field}>
                <label htmlFor="no-state">Estado</label>
                <select id="no-state" {...form.register('state')}>
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
            </div>
          </Panel>
        </div>

        <div className={styles.page}>
          <Panel title="4. Pagamento e resumo">
            <div className={styles.page} style={{ gap: 'var(--space-4)' }}>
              <div className={styles.field}>
                <label htmlFor="no-method">Forma de pagamento</label>
                <select id="no-method" {...form.register('paymentMethod')}>
                  <option value="PIX">Pix</option>
                  <option value="CARD">Cartão</option>
                </select>
              </div>
              <label className={styles.check}>
                <input type="checkbox" {...form.register('paid')} /> Pagamento já recebido
              </label>
              {paid ? (
                <div className={styles.field}>
                  <label htmlFor="no-paymentNote">Como foi pago (obrigatório)</label>
                  <input id="no-paymentNote" maxLength={500} placeholder="Ex.: Pix recebido, comprovante no WhatsApp" aria-invalid={e.paymentNote ? true : undefined} {...form.register('paymentNote')} />
                  {e.paymentNote ? <p className={styles.fieldError}>{e.paymentNote.message}</p> : null}
                </div>
              ) : null}
              <div className={styles.field}>
                <label htmlFor="no-notes">Observações (opcional)</label>
                <textarea id="no-notes" maxLength={500} aria-invalid={e.notes ? true : undefined} {...form.register('notes')} />
                {e.notes ? <p className={styles.fieldError}>{e.notes.message}</p> : null}
              </div>

              {lines.length ? (
                quote.isPending ? (
                  <LoadingState label="Calculando…" />
                ) : quote.data ? (
                  <dl className={styles.dl}>
                    <dt>Itens</dt>
                    <dd>{units}</dd>
                    <dt>Subtotal</dt>
                    <dd>{money(quote.data.subtotal)}</dd>
                    <dt>Frete</dt>
                    <dd>{quote.data.shipping ? money(quote.data.shipping) : 'Grátis'}</dd>
                    <dt>Total</dt>
                    <dd>
                      <strong>{money(quote.data.total)}</strong>
                    </dd>
                  </dl>
                ) : null
              ) : null}
              {quote.data && !quote.data.valid ? (
                <Alert tone="danger">
                  {quote.data.lines
                    .filter((l) => l.problem)
                    .map((l) => `${l.productName}: ${l.problem === 'INSUFFICIENT_STOCK' ? `só ${l.availableStock} em estoque` : 'indisponível'}`)
                    .join(' · ')}
                </Alert>
              ) : null}
              <Button type="submit" loading={create.isPending} disabled={!lines.length}>
                {paid ? 'Criar pedido pago' : 'Criar pedido'}
              </Button>
              <p className={styles.muted}>
                {paid ? 'O pedido entra como Pago e a receita vai para o Financeiro.' : 'O pedido entra como Aguardando pagamento. Confirme o pagamento depois, na página do pedido.'}
              </p>
            </div>
          </Panel>
        </div>
      </form>
    </div>
  );
}

/** Busca de produto com tamanhos clicáveis. */
function ItemPicker({ onAdd, threshold }: { onAdd: (p: AdminProduct, v: AdminVariant) => void; threshold: number }) {
  const all = useAllProducts();
  const [term, setTerm] = useState('');
  const results = useMemo(() => (term.trim().length >= 2 ? filterProducts((all.data ?? []).filter((p) => p.isActive), term).slice(0, 8) : []), [all.data, term]);
  return (
    <div className={styles.page} style={{ gap: 'var(--space-3)' }}>
      <SearchField id="no-product" label="Buscar produto" value={term} onChange={setTerm} placeholder="Nome, categoria ou SKU (mín. 2 letras)" />
      {all.isPending && term.length >= 2 ? <LoadingState label="Carregando produtos…" /> : null}
      {term.trim().length >= 2 && all.data && !results.length ? <p className={styles.muted}>Nenhum produto ativo com “{term}”.</p> : null}
      {results.length ? (
        <ul className={styles.variantResults}>
          {results.map((p) => (
            <li key={p.id} className={styles.variantPick}>
              <span className={styles.entryHead}>
                <Thumb url={coverOf(p)} alt="" size={40} />
                <span>
                  <strong>{p.name}</strong>
                  <span className={styles.muted} style={{ display: 'block' }}>
                    {money(p.salePrice ?? p.price)}
                  </span>
                </span>
              </span>
              <span className={styles.actions}>
                {p.variants
                  .filter((v) => v.isActive)
                  .map((v) => (
                    <button key={v.id} type="button" className={styles.linkButton} disabled={v.stock <= 0} onClick={() => onAdd(p, v)} aria-label={`Adicionar ${p.name} ${variantName(v)}`}>
                      {variantName(v)} <StockBadge stock={v.stock} threshold={threshold} compact />
                    </button>
                  ))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Busca cliente já cadastrado e preenche nome, telefone, e-mail e o último endereço. */
function CustomerFinder({ onPick }: { onPick: (c: Customer, address: OrderFormIn | null) => void }) {
  const key = useAdminKey();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);
  const results = useQuery({
    queryKey: key('customers', 'finder', debounced),
    queryFn: () => adminApi.customers({ search: debounced, pageSize: 6 }),
    enabled: debounced.length >= 2,
  });
  const pick = async (c: Customer) => {
    setTerm('');
    const detail = await adminApi.customer(c.id).catch(() => null);
    const last = detail?.orders[0]?.address;
    onPick(c, last ? ({ ...last, complement: last.complement ?? '', state: last.state } as unknown as OrderFormIn) : null);
  };
  return (
    <div className={styles.page} style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
      <SearchField id="no-customer" label="Cliente já cadastrado? (opcional)" value={term} onChange={setTerm} placeholder="Nome, telefone ou e-mail" />
      {debounced.length >= 2 && results.data ? (
        results.data.items.length ? (
          <ul className={styles.pickList}>
            {results.data.items.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => void pick(c)}>
                  <span>
                    <strong>{c.name}</strong>
                    <span className={styles.muted}>
                      {c.phone}
                      {c.email ? ` · ${c.email}` : ''}
                    </span>
                  </span>
                  <PlusIcon size={18} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>Nenhum cliente encontrado. Preencha os dados abaixo: ele é cadastrado junto com o pedido.</p>
        )
      ) : null}
      <span className="visually-hidden" aria-live="polite">
        {results.data ? `${results.data.items.length} clientes encontrados` : ''}
      </span>
    </div>
  );
}
