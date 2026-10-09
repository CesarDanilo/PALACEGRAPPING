import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from '@/lib/zod';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import { adminApi, type AdminCatalog, type AdminCategory, type StockMovement } from '@/lib/api/admin';
import { PageHeader, Pager, Panel, dateTime, errorMessage, useAdminKey, useAdminMutation } from './common';
import styles from './admin.module.css';
import { toNumber } from '@/lib/validation';

const slugRule = z.union([z.literal(''), z.string().max(120, 'Máximo de 120 caracteres').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use minúsculas, números e hífens')]);
const intFromInput = { setValueAs: (v: string | number) => (typeof v === 'number' ? v : toNumber(v)) };

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ───────────────────────── Categorias ─────────────────────────

export function CategoriesPage() {
  const key = useAdminKey();
  const { can } = useAdminSession();
  const categories = useQuery({ queryKey: key('categories'), queryFn: adminApi.categories });
  const categorySchema = z.object({ name: z.string().trim().min(2, 'Mínimo de 2 caracteres').max(80, 'Máximo de 80 caracteres') });
  const form = useForm<z.infer<typeof categorySchema>>({ resolver: zodResolver(categorySchema), defaultValues: { name: '' } });
  const create = useAdminMutation(
    ({ name }: { name: string }) => adminApi.createCategory({ name, slug: slugify(name), description: null, parentId: null, position: categories.data?.items.length ?? 0, isActive: true }),
    () => form.reset({ name: '' }),
  );
  const update = useAdminMutation((v: { id: string; body: Partial<AdminCategory> }) => adminApi.updateCategory(v.id, v.body));
  const err = create.error ?? update.error;

  return (
    <div className={styles.page}>
      <PageHeader title="Categorias" description="Organizam a vitrine e os filtros da loja." />
      {err ? <Alert tone="danger">{errorMessage(err)}</Alert> : null}
      {can('catalog:write') ? (
        <form className={styles.toolbar} noValidate onSubmit={form.handleSubmit((v) => create.mutate(v))}>
          <div className={styles.field}>
            <label htmlFor="cat-name">Nova categoria</label>
            <input id="cat-name" placeholder="Ex.: Kimonos" aria-invalid={form.formState.errors.name ? true : undefined} {...form.register('name')} />
            {form.formState.errors.name ? <p className={styles.fieldError}>{form.formState.errors.name.message}</p> : null}
          </div>
          <Button size="sm" type="submit" loading={create.isPending}>
            Criar
          </Button>
        </form>
      ) : null}
      <Panel>
        {categories.isPending ? (
          <LoadingState />
        ) : !categories.data?.items.length ? (
          <EmptyState title="Nenhuma categoria" />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Slug</th>
                <th scope="col" className={styles.num}>Ordem</th>
                <th scope="col">Ativa</th>
              </tr>
            </thead>
            <tbody>
              {categories.data.items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input
                      className={styles.inlineInput}
                      aria-label={`Nome de ${c.name}`}
                      defaultValue={c.name}
                      disabled={!can('catalog:write')}
                      onBlur={(e) => e.target.value.trim() !== c.name && update.mutate({ id: c.id, body: { name: e.target.value.trim() } })}
                    />
                  </td>
                  <td className={styles.code}>{c.slug}</td>
                  <td className={styles.num}>
                    <input
                      className={styles.inlineInput}
                      style={{ width: '5rem' }}
                      type="number"
                      aria-label={`Ordem de ${c.name}`}
                      defaultValue={c.position}
                      disabled={!can('catalog:write')}
                      onBlur={(e) => Number(e.target.value) !== c.position && update.mutate({ id: c.id, body: { position: Number(e.target.value) } })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${c.name} ativa`}
                      checked={c.isActive}
                      disabled={!can('catalog:write')}
                      onChange={(e) => update.mutate({ id: c.id, body: { isActive: e.target.checked } })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

// ───────────────────────── Estoque ─────────────────────────

const movementLabel: Record<StockMovement['type'], string> = {
  INBOUND: 'Entrada',
  OUTBOUND: 'Saída',
  ADJUSTMENT: 'Ajuste',
  SALE: 'Venda',
  RELEASE: 'Devolução ao estoque',
  RETURN: 'Devolução de cliente',
};

const movementSchema = z
  .object({
    type: z.enum(['INBOUND', 'OUTBOUND', 'ADJUSTMENT']),
    quantity: z.number({ error: 'Informe um número' }).int('Use um número inteiro').min(0, 'Não pode ser negativo'),
    reason: z.string().trim().min(2, 'Descreva o motivo').max(200, 'Máximo de 200 caracteres'),
  })
  .superRefine((v, ctx) => {
    if (v.type !== 'ADJUSTMENT' && v.quantity < 1) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Mínimo de 1 unidade' });
    if (v.type !== 'ADJUSTMENT' && v.quantity > 100_000) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Máximo de 100.000 por movimentação' });
    if (v.type === 'ADJUSTMENT' && v.quantity > 1_000_000) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Máximo de 1.000.000' });
  });
type MovementForm = z.infer<typeof movementSchema>;

export function InventoryPage() {
  const key = useAdminKey();
  const { can } = useAdminSession();
  const [params, setParams] = useSearchParams();
  const variantId = params.get('variante') ?? undefined;
  const page = Number(params.get('pagina') ?? 1);
  const low = useQuery({ queryKey: key('low-stock'), queryFn: adminApi.lowStock });
  const movements = useQuery({
    queryKey: key('movements', variantId, page),
    queryFn: () => adminApi.movements({ variantId, page, pageSize: 30 }),
    placeholderData: keepPreviousData,
  });
  const form = useForm<MovementForm>({ resolver: zodResolver(movementSchema), defaultValues: { type: 'INBOUND', quantity: 1, reason: '' } });
  const type = form.watch('type');
  const me = form.formState.errors;
  const move = useAdminMutation(
    (v: MovementForm) =>
      adminApi.move(variantId!, v.type === 'ADJUSTMENT' ? { type: 'ADJUSTMENT', countedStock: v.quantity, reason: v.reason } : { type: v.type, quantity: v.quantity, reason: v.reason }),
    () => form.reset({ ...form.getValues(), reason: '' }),
  );

  return (
    <div className={styles.page}>
      <PageHeader title="Estoque" description="Saldo por variante e histórico de todas as movimentações." />
      <div className={styles.split}>
        <Panel title={variantId ? 'Movimentações da variante' : 'Últimas movimentações'} actions={variantId ? <button type="button" className={styles.linkButton} onClick={() => setParams({})}>Ver todas</button> : null}>
          {movements.isPending ? (
            <LoadingState />
          ) : movements.isError ? (
            <Alert tone="danger">{errorMessage(movements.error)}</Alert>
          ) : !movements.data.items.length ? (
            <EmptyState title="Sem movimentações" />
          ) : (
            <>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">SKU</th>
                    <th scope="col">Tipo</th>
                    <th scope="col" className={styles.num}>Qtd.</th>
                    <th scope="col" className={styles.num}>Saldo</th>
                    <th scope="col">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.data.items.map((m) => (
                    <tr key={m.id}>
                      <td>{dateTime(m.createdAt)}</td>
                      <td>
                        <Link className={styles.code} to={`/admin/estoque?variante=${m.variantId}`}>
                          {m.sku}
                        </Link>
                      </td>
                      <td>{movementLabel[m.type]}</td>
                      <td className={styles.num}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                      <td className={styles.num}>{m.balanceAfter}</td>
                      <td>
                        {m.reason}
                        {m.orderId ? (
                          <>
                            {' '}
                            · <Link to={`/admin/pedidos/${m.orderId}`}>pedido</Link>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager page={movements.data.page} totalPages={movements.data.totalPages} onChange={(p) => setParams({ ...(variantId ? { variante: variantId } : {}), pagina: String(p) })} />
            </>
          )}
        </Panel>

        <div className={styles.page}>
          {variantId && can('inventory:write') ? (
            <Panel title="Registrar movimentação">
              {move.isError ? <Alert tone="danger">{errorMessage(move.error)}</Alert> : null}
              {move.isSuccess ? <Alert tone="success">Saldo atual: {move.data.balance}</Alert> : null}
              <form className={styles.page} noValidate onSubmit={form.handleSubmit((v) => move.mutate(v))}>
                <div className={styles.field}>
                  <label htmlFor="mv-type">Tipo</label>
                  <select id="mv-type" {...form.register('type')}>
                    <option value="INBOUND">Entrada</option>
                    <option value="OUTBOUND">Saída (perda, avaria, brinde)</option>
                    <option value="ADJUSTMENT">Ajuste para saldo contado</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="mv-qty">{type === 'ADJUSTMENT' ? 'Saldo contado' : 'Quantidade'}</label>
                  <input id="mv-qty" type="number" inputMode="numeric" step={1} min={type === 'ADJUSTMENT' ? 0 : 1} aria-invalid={me.quantity ? true : undefined} {...form.register('quantity', intFromInput)} />
                  {me.quantity ? <p className={styles.fieldError}>{me.quantity.message}</p> : null}
                </div>
                <div className={styles.field}>
                  <label htmlFor="mv-reason">Motivo</label>
                  <input id="mv-reason" aria-invalid={me.reason ? true : undefined} {...form.register('reason')} />
                  {me.reason ? <p className={styles.fieldError}>{me.reason.message}</p> : null}
                </div>
                <Button size="sm" type="submit" loading={move.isPending}>
                  Registrar
                </Button>
              </form>
            </Panel>
          ) : (
            <p className={styles.muted}>Escolha uma variante (pelo SKU no histórico ou na página do produto) para registrar entrada, saída ou ajuste.</p>
          )}
          <Panel title="Estoque baixo">
            {low.data?.items.length ? (
              <ul className={styles.activity}>
                {low.data.items.map((v) => (
                  <li key={v.id}>
                    <Link to={`/admin/estoque?variante=${v.id}`}>{v.productName}</Link> <span className={styles.code}>{v.sku}</span> · <strong>{v.stock}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>Nada abaixo do limite.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Catálogos ─────────────────────────

const typeLabel: Record<AdminCatalog['type'], string> = { GENERAL: 'Geral', COLLECTION: 'Coleção', CAMPAIGN: 'Campanha' };
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export function CatalogsPage() {
  const key = useAdminKey();
  const { can } = useAdminSession();
  const catalogs = useQuery({ queryKey: key('catalogs'), queryFn: adminApi.catalogs });
  const [editing, setEditing] = useState<AdminCatalog | 'new' | null>(null);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Catálogos"
        description="Catálogo geral, coleções e campanhas. Privados abrem só por link exclusivo."
        actions={can('catalog:write') ? <Button size="sm" onClick={() => setEditing('new')}>Novo catálogo</Button> : null}
      />
      {editing ? <CatalogEditor key={editing === 'new' ? 'new' : editing.id} catalog={editing === 'new' ? null : editing} onDone={() => setEditing(null)} /> : null}
      <Panel>
        {catalogs.isPending ? (
          <LoadingState />
        ) : !catalogs.data?.items.length ? (
          <EmptyState title="Nenhum catálogo" />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Tipo</th>
                <th scope="col">Visibilidade</th>
                <th scope="col" className={styles.num}>Produtos</th>
                <th scope="col">Período</th>
                <th scope="col"><span className="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {catalogs.data.items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    <div className={styles.code}>/catalogo/{c.slug}</div>
                  </td>
                  <td>{typeLabel[c.type]}</td>
                  <td>{!c.isActive ? 'Inativo' : c.isPublic ? 'Público' : 'Privado (link)'}</td>
                  <td className={styles.num}>{c.productIds.length}</td>
                  <td>{c.startsAt || c.endsAt ? `${dateTime(c.startsAt)} → ${dateTime(c.endsAt)}` : 'Sempre'}</td>
                  <td>
                    {can('catalog:write') ? (
                      <button type="button" className={styles.linkButton} onClick={() => setEditing(c)}>
                        Editar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

const catalogSchema = z
  .object({
    name: z.string().trim().min(2, 'Mínimo de 2 caracteres').max(120, 'Máximo de 120 caracteres'),
    slug: slugRule,
    description: z.string().max(5_000, 'Máximo de 5.000 caracteres'),
    type: z.enum(['GENERAL', 'COLLECTION', 'CAMPAIGN']),
    isPublic: z.boolean(),
    isActive: z.boolean(),
    heroImageUrl: z.union([z.literal(''), z.url({ protocol: /^https?$/, error: 'Use um endereço http(s) válido' }).max(2_000)]),
    startsAt: z.string(),
    endsAt: z.string(),
    productIds: z.array(z.string()).max(500, 'No máximo 500 produtos'),
  })
  .refine((v) => !v.startsAt || !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt), { path: ['endsAt'], message: 'O fim deve ser depois do início' });
type CatalogForm = z.infer<typeof catalogSchema>;

function CatalogEditor({ catalog, onDone }: { catalog: AdminCatalog | null; onDone: () => void }) {
  const key = useAdminKey();
  const products = useQuery({ queryKey: key('products', 'all'), queryFn: () => adminApi.products({ pageSize: 100 }) });
  const form = useForm<CatalogForm>({
    resolver: zodResolver(catalogSchema),
    defaultValues: {
      name: catalog?.name ?? '',
      slug: catalog?.slug ?? '',
      description: catalog?.description ?? '',
      type: catalog?.type ?? 'COLLECTION',
      isPublic: catalog?.isPublic ?? true,
      isActive: catalog?.isActive ?? true,
      heroImageUrl: catalog?.heroImageUrl ?? '',
      startsAt: toLocalInput(catalog?.startsAt ?? null),
      endsAt: toLocalInput(catalog?.endsAt ?? null),
      productIds: catalog?.productIds ?? [],
    },
  });
  const { register, formState } = form;
  const e = formState.errors;
  const name = form.watch('name');
  const selected = form.watch('productIds');
  const save = useAdminMutation(async (v: CatalogForm) => {
    const body = {
      name: v.name,
      slug: v.slug || slugify(v.name),
      description: v.description,
      type: v.type,
      isPublic: v.isPublic,
      isActive: v.isActive,
      heroImageUrl: v.heroImageUrl || null,
      startsAt: fromLocalInput(v.startsAt),
      endsAt: fromLocalInput(v.endsAt),
    };
    if (catalog) {
      await adminApi.updateCatalog(catalog.id, body);
      return adminApi.setCatalogProducts(catalog.id, v.productIds);
    }
    return adminApi.createCatalog({ ...body, productIds: v.productIds });
  }, onDone);

  return (
    <Panel title={catalog ? `Editar ${catalog.name}` : 'Novo catálogo'}>
      {save.isError ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
      <form noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className={styles.page}>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="cg-name">Nome</label>
            <input id="cg-name" aria-invalid={e.name ? true : undefined} {...register('name')} />
            {e.name ? <p className={styles.fieldError}>{e.name.message}</p> : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="cg-slug">Slug</label>
            <input id="cg-slug" placeholder={slugify(name)} aria-invalid={e.slug ? true : undefined} {...register('slug')} />
            {e.slug ? <p className={styles.fieldError}>{e.slug.message}</p> : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="cg-type">Tipo</label>
            <select id="cg-type" {...register('type')}>
              <option value="GENERAL">Geral</option>
              <option value="COLLECTION">Coleção</option>
              <option value="CAMPAIGN">Campanha</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="cg-hero">Imagem de capa (URL, opcional)</label>
            <input id="cg-hero" type="url" inputMode="url" aria-invalid={e.heroImageUrl ? true : undefined} {...register('heroImageUrl')} />
            {e.heroImageUrl ? <p className={styles.fieldError}>{e.heroImageUrl.message}</p> : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="cg-start">Início (opcional)</label>
            <input id="cg-start" type="datetime-local" {...register('startsAt')} />
          </div>
          <div className={styles.field}>
            <label htmlFor="cg-end">Fim (opcional; ativa a contagem regressiva)</label>
            <input id="cg-end" type="datetime-local" aria-invalid={e.endsAt ? true : undefined} {...register('endsAt')} />
            {e.endsAt ? <p className={styles.fieldError}>{e.endsAt.message}</p> : null}
          </div>
          <div className={`${styles.field} ${styles.span2}`}>
            <label htmlFor="cg-desc">Descrição</label>
            <textarea id="cg-desc" aria-invalid={e.description ? true : undefined} {...register('description')} />
            {e.description ? <p className={styles.fieldError}>{e.description.message}</p> : null}
          </div>
          <div className={styles.actions}>
            <label className={styles.check}>
              <input type="checkbox" {...register('isPublic')} /> Público (abre por slug)
            </label>
            <label className={styles.check}>
              <input type="checkbox" {...register('isActive')} /> Ativo
            </label>
          </div>
        </div>
        <fieldset className={styles.field} style={{ border: 0, padding: 0, minWidth: 0 }}>
          <legend>Produtos ({selected.length})</legend>
          {e.productIds ? <p className={styles.fieldError}>{e.productIds.message}</p> : null}
          <div className={styles.picker}>
            {products.data?.items.map((p) => (
              <label key={p.id} className={styles.check}>
                <input type="checkbox" value={p.id} {...register('productIds')} />
                {p.name} {!p.isActive ? '(inativo)' : ''}
              </label>
            ))}
          </div>
        </fieldset>
        <div className={styles.actions}>
          <Button size="sm" type="submit" loading={save.isPending}>
            Salvar
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </form>
    </Panel>
  );
}

// ───────────────────────── Links exclusivos ─────────────────────────

const linkSchema = z.object({
  catalogId: z.string().min(1, 'Escolha um catálogo'),
  label: z.string().trim().min(2, 'Mínimo de 2 caracteres').max(120, 'Máximo de 120 caracteres'),
  expiresAt: z.string().refine((v) => !v || new Date(v).getTime() > Date.now(), 'Escolha uma data futura'),
  maxUses: z.string().refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1_000_000), 'Número inteiro de 1 a 1.000.000'),
});
type LinkForm = z.infer<typeof linkSchema>;

export function LinksPage() {
  const key = useAdminKey();
  const { can } = useAdminSession();
  const links = useQuery({ queryKey: key('links'), queryFn: adminApi.links });
  const catalogs = useQuery({ queryKey: key('catalogs'), queryFn: adminApi.catalogs });
  const form = useForm<LinkForm>({ resolver: zodResolver(linkSchema), defaultValues: { catalogId: '', label: '', expiresAt: '', maxUses: '' } });
  const le = form.formState.errors;
  const [copied, setCopied] = useState<string | null>(null);
  const create = useAdminMutation(
    (v: LinkForm) =>
      adminApi.createLink({
        catalogId: v.catalogId,
        label: v.label,
        expiresAt: fromLocalInput(v.expiresAt),
        maxUses: v.maxUses === '' ? null : Number(v.maxUses),
      }),
    () => form.reset({ catalogId: form.getValues('catalogId'), label: '', expiresAt: '', maxUses: '' }),
  );
  const toggle = useAdminMutation((v: { id: string; isActive: boolean }) => adminApi.updateLink(v.id, { isActive: v.isActive }));
  const now = Date.now();

  return (
    <div className={styles.page}>
      <PageHeader title="Links exclusivos" description="Compartilham uma seleção sem expor o catálogo. O token não dá acesso ao painel." />
      {create.isError ? <Alert tone="danger">{errorMessage(create.error)}</Alert> : null}
      {can('catalog:write') ? (
        <Panel title="Gerar link">
          <form className={styles.toolbar} noValidate onSubmit={form.handleSubmit((v) => create.mutate(v))}>
            <div className={styles.field}>
              <label htmlFor="lk-catalog">Catálogo</label>
              <select id="lk-catalog" aria-invalid={le.catalogId ? true : undefined} {...form.register('catalogId')}>
                <option value="">Escolha…</option>
                {catalogs.data?.items
                  .filter((c) => c.isActive)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <p className={styles.muted}>Só catálogos ativos. Para usar outro, ative-o em Catálogos.</p>
              {le.catalogId ? <p className={styles.fieldError}>{le.catalogId.message}</p> : null}
            </div>
            <div className={styles.field}>
              <label htmlFor="lk-label">Identificação</label>
              <input id="lk-label" placeholder="Ex.: Equipe de competição" aria-invalid={le.label ? true : undefined} {...form.register('label')} />
              {le.label ? <p className={styles.fieldError}>{le.label.message}</p> : null}
            </div>
            <div className={styles.field}>
              <label htmlFor="lk-exp">Expira em (opcional)</label>
              <input id="lk-exp" type="datetime-local" aria-invalid={le.expiresAt ? true : undefined} {...form.register('expiresAt')} />
              {le.expiresAt ? <p className={styles.fieldError}>{le.expiresAt.message}</p> : null}
            </div>
            <div className={styles.field}>
              <label htmlFor="lk-max">Limite de pedidos (opcional)</label>
              <input id="lk-max" type="number" inputMode="numeric" min={1} step={1} aria-invalid={le.maxUses ? true : undefined} {...form.register('maxUses')} />
              {le.maxUses ? <p className={styles.fieldError}>{le.maxUses.message}</p> : null}
            </div>
            <Button size="sm" type="submit" loading={create.isPending}>
              Gerar
            </Button>
          </form>
        </Panel>
      ) : null}
      <Panel>
        {links.isPending ? (
          <LoadingState />
        ) : !links.data?.items.length ? (
          <EmptyState title="Nenhum link gerado" />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Identificação</th>
                <th scope="col">Catálogo</th>
                <th scope="col">Situação</th>
                <th scope="col" className={styles.num}>Pedidos</th>
                <th scope="col">Link</th>
                <th scope="col">Ativo</th>
              </tr>
            </thead>
            <tbody>
              {links.data.items.map((l) => {
                const expired = l.expiresAt && new Date(l.expiresAt).getTime() <= now;
                const exhausted = l.maxUses != null && l.useCount >= l.maxUses;
                return (
                  <tr key={l.id}>
                    <td>{l.label}</td>
                    <td>{l.catalog.name}</td>
                    <td>{!l.isActive ? 'Desativado' : !l.catalog.isActive ? 'Catálogo inativo (não abre)' : expired ? 'Expirado' : exhausted ? 'Limite atingido' : l.expiresAt ? `Até ${dateTime(l.expiresAt)}` : 'Válido'}</td>
                    <td className={styles.num}>
                      {l.useCount}
                      {l.maxUses != null ? ` / ${l.maxUses}` : ''}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={async () => {
                          await navigator.clipboard?.writeText(l.url);
                          setCopied(l.id);
                        }}
                      >
                        {copied === l.id ? 'Copiado' : 'Copiar URL'}
                      </button>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Link ${l.label} ativo`}
                        checked={l.isActive}
                        disabled={!can('catalog:write')}
                        onChange={(e) => toggle.mutate({ id: l.id, isActive: e.target.checked })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
