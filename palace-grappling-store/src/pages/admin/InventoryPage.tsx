import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { AlertIcon, BoxIcon, PlusIcon, SearchIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import { adminApi, type AdminProduct, type StockMovement } from '@/lib/api/admin';
import { toNumber } from '@/lib/validation';
import { z } from '@/lib/zod';
import { PageHeader, Pager, Panel, dateTime, errorMessage, useAdminKey, useAdminMutation } from './common';
import { Callout, Kpi, StockBadge, Thumb, useLowStockThreshold } from './highlights';
import styles from './admin.module.css';

const movementLabel: Record<StockMovement['type'], string> = {
  INBOUND: 'Entrada',
  OUTBOUND: 'Saída',
  ADJUSTMENT: 'Ajuste',
  SALE: 'Venda',
  RELEASE: 'Devolvido ao estoque',
  RETURN: 'Devolução de cliente',
};
const movementTone: Record<StockMovement['type'], string> = {
  INBOUND: 'ok',
  RELEASE: 'ok',
  RETURN: 'ok',
  OUTBOUND: 'bad',
  SALE: 'info',
  ADJUSTMENT: 'warn',
};
const variantName = (v: { size: string | null; color: string | null; sku: string }) => [v.size, v.color].filter(Boolean).join(' · ') || v.sku;
const coverOf = (p: AdminProduct) => [...p.images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.position - b.position)[0]?.url;

/**
 * Estoque: (1) o que precisa de atenção, (2) entrada de mercadoria em poucos passos,
 * (3) ajuste/saída de uma variante, (4) histórico.
 */
export function InventoryPage() {
  const key = useAdminKey();
  const { can } = useAdminSession();
  const threshold = useLowStockThreshold();
  const [params, setParams] = useSearchParams();
  const variantId = params.get('variante') ?? undefined;
  const page = Number(params.get('pagina') ?? 1);
  const [entryProductId, setEntryProductId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const low = useQuery({ queryKey: key('low-stock'), queryFn: adminApi.lowStock });
  const movements = useQuery({
    queryKey: key('movements', variantId, page),
    queryFn: () => adminApi.movements({ variantId, page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  });

  const lowItems = [...(low.data?.items ?? [])].sort((a, b) => a.stock - b.stock);
  const out = lowItems.filter((v) => v.stock <= 0).length;
  const writable = can('inventory:write');

  const startEntry = (productId: string) => {
    setEntryProductId(productId);
    setSearch('');
    document.getElementById('entrada')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={styles.page}>
      <PageHeader title="Estoque" description="Reposição, ajustes e o histórico de cada unidade que entrou ou saiu." />

      <section aria-label="Situação do estoque" className={styles.kpis}>
        <Kpi label="Esgotadas" value={out} icon={AlertIcon} tone={out ? 'danger' : 'success'} hint={out ? 'Não vendem até repor' : 'Nenhuma variante zerada'} />
        <Kpi label="Estoque baixo" value={lowItems.length - out} icon={BoxIcon} tone={lowItems.length - out ? 'warn' : 'success'} hint={`Até ${threshold} unidades (muda em Configurações)`} />
        <Kpi label="Movimentações registradas" value={movements.data?.total ?? '—'} icon={BoxIcon} hint="Entradas, saídas, vendas e ajustes" />
      </section>

      <div className={styles.split}>
        <div className={styles.page}>
          {writable ? (
            <EntryPanel productId={entryProductId} onProduct={setEntryProductId} search={search} onSearch={setSearch} threshold={threshold} />
          ) : null}

          {variantId && writable ? <AdjustPanel variantId={variantId} onClose={() => setParams({})} /> : null}

          <Panel
            title={variantId ? 'Histórico da variante' : 'Histórico de movimentações'}
            actions={variantId ? <button type="button" className={styles.linkButton} onClick={() => setParams({})}>Ver todas</button> : null}
          >
            {movements.isPending ? (
              <LoadingState />
            ) : movements.isError ? (
              <Alert tone="danger">{errorMessage(movements.error)}</Alert>
            ) : !movements.data.items.length ? (
              <EmptyState title="Sem movimentações" />
            ) : (
              <>
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">Data</th>
                        <th scope="col">Tipo</th>
                        <th scope="col">SKU</th>
                        <th scope="col" className={styles.num}>Qtd.</th>
                        <th scope="col" className={styles.num}>Saldo</th>
                        <th scope="col">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.data.items.map((m) => (
                        <tr key={m.id}>
                          <td className={styles.muted}>{dateTime(m.createdAt)}</td>
                          <td>
                            <span className={`${styles.pill} ${styles[`pill_${movementTone[m.type]}`]}`}>{movementLabel[m.type]}</span>
                          </td>
                          <td>
                            <Link className={styles.code} to={`/admin/estoque?variante=${m.variantId}`}>
                              {m.sku}
                            </Link>
                          </td>
                          <td className={`${styles.num} ${m.quantity > 0 ? styles.positive : m.quantity < 0 ? styles.negative : ''}`}>
                            <strong>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</strong>
                          </td>
                          <td className={styles.num}>
                            <StockBadge stock={m.balanceAfter} threshold={threshold} compact />
                          </td>
                          <td>
                            {m.reason}
                            {m.orderId ? (
                              <>
                                {' '}
                                · <Link to={`/admin/pedidos/${m.orderId}`}>ver pedido</Link>
                              </>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={movements.data.page} totalPages={movements.data.totalPages} onChange={(p) => setParams({ ...(variantId ? { variante: variantId } : {}), pagina: String(p) })} />
              </>
            )}
          </Panel>
        </div>

        <Panel title="Precisa de reposição">
          {low.isPending ? (
            <LoadingState />
          ) : lowItems.length ? (
            <ul className={styles.restockList}>
              {lowItems.map((v) => (
                <li key={v.id} className={v.stock <= 0 ? styles.rowDanger : styles.rowWarn}>
                  <span className={styles.restockInfo}>
                    <strong>{v.productName}</strong>
                    <span className={styles.muted}>
                      {variantName(v)} · <span className={styles.code}>{v.sku}</span>
                    </span>
                  </span>
                  <StockBadge stock={v.stock} threshold={threshold} />
                  {writable ? (
                    <button type="button" className={styles.linkButton} onClick={() => startEntry(v.productId)} aria-label={`Repor ${v.productName} ${variantName(v)}`}>
                      Repor
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>Nada abaixo de {threshold} unidades. Tudo abastecido.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

/** Entrada de mercadoria: busca o produto, informa quantas unidades chegaram de cada variante. */
function EntryPanel({
  productId,
  onProduct,
  search,
  onSearch,
  threshold,
}: {
  productId: string | null;
  onProduct: (id: string | null) => void;
  search: string;
  onSearch: (q: string) => void;
  threshold: number;
}) {
  const key = useAdminKey();
  const queryClient = useQueryClient();
  const term = search.trim();
  const results = useQuery({
    queryKey: key('products', 'entry-search', term),
    queryFn: () => adminApi.products({ search: term, pageSize: 8 }),
    enabled: term.length >= 2 && !productId,
    placeholderData: keepPreviousData,
  });
  const product = useQuery({ queryKey: key('product', productId), queryFn: () => adminApi.product(productId!), enabled: Boolean(productId) });
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('Entrada de mercadoria');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const entries = Object.entries(quantities)
    .map(([variantId, raw]) => ({ variantId, quantity: toNumber(raw) }))
    .filter((e) => !Number.isNaN(e.quantity) && e.quantity !== 0);
  const invalid = entries.some((e) => !Number.isInteger(e.quantity) || e.quantity < 1 || e.quantity > 100_000) || reason.trim().length < 2;

  const submit = async () => {
    if (!entries.length || invalid || !product.data) return;
    setSaving(true);
    setError(null);
    let ok = 0;
    try {
      for (const e of entries) {
        await adminApi.move(e.variantId, { type: 'INBOUND', quantity: e.quantity, reason: reason.trim() });
        ok++;
      }
      setDone(`${entries.reduce((s, e) => s + e.quantity, 0)} unidades de ${product.data.name} registradas.`);
      setQuantities({});
    } catch (err) {
      setError(`${ok ? `${ok} de ${entries.length} variantes registradas. ` : ''}${errorMessage(err)}`);
    } finally {
      setSaving(false);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    }
  };

  return (
    <Panel title="Entrada de estoque">
      <div id="entrada" className={styles.page}>
        {done ? (
          <Callout tone="success" action={<button type="button" className={styles.linkButton} onClick={() => { setDone(null); onProduct(null); }}>Nova entrada</button>}>
            {done}
          </Callout>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}

        {!productId ? (
          <>
            <div className={styles.field}>
              <label htmlFor="entry-search">1. Qual produto chegou?</label>
              <div className={styles.searchBox}>
                <SearchIcon size={18} />
                <input id="entry-search" maxLength={80} type="search" placeholder="Nome ou SKU (mín. 2 letras)" value={search} onChange={(e) => onSearch(e.target.value)} autoComplete="off" />
              </div>
            </div>
            {term.length >= 2 ? (
              results.isPending ? (
                <LoadingState />
              ) : results.data?.items.length ? (
                <ul className={styles.pickList}>
                  {results.data.items.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => { setDone(null); onProduct(p.id); }}>
                        <Thumb url={coverOf(p)} alt="" size={40} />
                        <span>
                          <strong>{p.name}</strong>
                          <span className={styles.muted}>{p.variants.length} variantes · {p.variants.reduce((s, v) => s + v.stock, 0)} em estoque</span>
                        </span>
                        <PlusIcon size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>Nenhum produto encontrado para “{term}”.</p>
              )
            ) : null}
          </>
        ) : product.isPending ? (
          <LoadingState />
        ) : product.isError ? (
          <Alert tone="danger">{errorMessage(product.error)}</Alert>
        ) : (
          <form
            className={styles.page}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className={styles.entryHead}>
              <Thumb url={coverOf(product.data)} alt="" size={56} />
              <span>
                <strong>{product.data.name}</strong>
                <span className={styles.muted} style={{ display: 'block' }}>
                  2. Quantas unidades chegaram de cada variante?
                </span>
              </span>
              <button type="button" className={styles.linkButton} onClick={() => { onProduct(null); setQuantities({}); }}>
                Trocar produto
              </button>
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Variante</th>
                    <th scope="col">Hoje</th>
                    <th scope="col">Chegaram</th>
                    <th scope="col">Fica</th>
                  </tr>
                </thead>
                <tbody>
                  {product.data.variants.map((v) => {
                    const raw = quantities[v.id] ?? '';
                    const qty = toNumber(raw);
                    const bad = raw !== '' && (!Number.isInteger(qty) || qty < 1 || qty > 100_000);
                    return (
                      <tr key={v.id}>
                        <td>
                          <strong>{variantName(v)}</strong>
                          <span className={`${styles.code} ${styles.muted}`} style={{ display: 'block' }}>
                            {v.sku}
                            {!v.isActive ? ' · inativa' : ''}
                          </span>
                        </td>
                        <td>
                          <StockBadge stock={v.stock} threshold={threshold} />
                        </td>
                        <td>
                          <input
                            className={styles.inlineInput}
                            style={{ width: '6.5rem' }}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            placeholder="0"
                            aria-label={`Unidades que chegaram de ${variantName(v)}`}
                            aria-invalid={bad || undefined}
                            value={raw}
                            onChange={(e) => setQuantities((q) => ({ ...q, [v.id]: e.target.value }))}
                          />
                          {bad ? <p className={styles.fieldError}>Inteiro de 1 a 100.000</p> : null}
                        </td>
                        <td className={styles.num}>{!bad && qty > 0 ? <strong className={styles.positive}>{v.stock + qty}</strong> : <span className={styles.muted}>{v.stock}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={styles.field}>
              <label htmlFor="entry-reason">3. Motivo (aparece no histórico)</label>
              <input id="entry-reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={reason.trim().length < 2 || undefined} />
              {reason.trim().length < 2 ? <p className={styles.fieldError}>Informe o motivo</p> : null}
            </div>
            <div>
              <Button type="submit" size="sm" loading={saving} disabled={!entries.length || invalid}>
                {entries.length ? `Registrar entrada de ${entries.reduce((s, e) => s + (Number.isInteger(e.quantity) && e.quantity > 0 ? e.quantity : 0), 0)} unidades` : 'Informe as quantidades'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Panel>
  );
}

const adjustSchema = z
  .object({
    type: z.enum(['OUTBOUND', 'ADJUSTMENT', 'INBOUND']),
    quantity: z.number({ error: 'Informe um número' }).int('Use um número inteiro').min(0, 'Não pode ser negativo'),
    reason: z.string().trim().min(2, 'Descreva o motivo').max(200, 'Máximo de 200 caracteres'),
  })
  .superRefine((v, ctx) => {
    if (v.type !== 'ADJUSTMENT' && v.quantity < 1) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Mínimo de 1 unidade' });
    if (v.type !== 'ADJUSTMENT' && v.quantity > 100_000) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Máximo de 100.000 por movimentação' });
    if (v.type === 'ADJUSTMENT' && v.quantity > 1_000_000) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Máximo de 1.000.000' });
  });
type AdjustForm = z.infer<typeof adjustSchema>;
const intFromInput = { setValueAs: (v: string | number) => (typeof v === 'number' ? v : toNumber(v)) };

/** Saída (perda, brinde) ou ajuste para o saldo contado de uma variante específica. */
function AdjustPanel({ variantId, onClose }: { variantId: string; onClose: () => void }) {
  const form = useForm<AdjustForm>({ resolver: zodResolver(adjustSchema), defaultValues: { type: 'OUTBOUND', quantity: 1, reason: '' } });
  const type = form.watch('type');
  const e = form.formState.errors;
  const move = useAdminMutation(
    (v: AdjustForm) =>
      adminApi.move(variantId, v.type === 'ADJUSTMENT' ? { type: 'ADJUSTMENT', countedStock: v.quantity, reason: v.reason } : { type: v.type, quantity: v.quantity, reason: v.reason }),
    () => form.reset({ ...form.getValues(), reason: '' }),
  );
  return (
    <Panel title="Saída ou ajuste desta variante" actions={<button type="button" className={styles.linkButton} onClick={onClose}>Fechar</button>}>
      {move.isError ? <Alert tone="danger">{errorMessage(move.error)}</Alert> : null}
      {move.isSuccess ? <Alert tone="success">Saldo atual: {move.data.balance}</Alert> : null}
      <form className={styles.formGrid} noValidate onSubmit={form.handleSubmit((v) => move.mutate(v))}>
        <div className={styles.field}>
          <label htmlFor="mv-type">Tipo</label>
          <select id="mv-type" {...form.register('type')}>
            <option value="OUTBOUND">Saída (perda, avaria, brinde)</option>
            <option value="ADJUSTMENT">Ajuste para o saldo contado</option>
            <option value="INBOUND">Entrada</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="mv-qty">{type === 'ADJUSTMENT' ? 'Saldo contado' : 'Quantidade'}</label>
          <input id="mv-qty" type="number" inputMode="numeric" step={1} min={type === 'ADJUSTMENT' ? 0 : 1} aria-invalid={e.quantity ? true : undefined} {...form.register('quantity', intFromInput)} />
          {e.quantity ? <p className={styles.fieldError}>{e.quantity.message}</p> : null}
        </div>
        <div className={`${styles.field} ${styles.span2}`}>
          <label htmlFor="mv-reason">Motivo</label>
          <input id="mv-reason" maxLength={200} aria-invalid={e.reason ? true : undefined} {...form.register('reason')} />
          {e.reason ? <p className={styles.fieldError}>{e.reason.message}</p> : null}
        </div>
        <div>
          <Button size="sm" type="submit" loading={move.isPending}>
            Registrar
          </Button>
        </div>
      </form>
    </Panel>
  );
}
