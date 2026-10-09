import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from '@/lib/zod';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import { adminApi, type AdminCatalog, type AdminCategory } from '@/lib/api/admin';
import { PageHeader, Panel, dateTime, errorMessage, useAdminKey, useAdminMutation } from './common';
import { ProductPicker } from './product-search';
import styles from './admin.module.css';

const slugRule = z.union([z.literal(''), z.string().max(120, 'Máximo de 120 caracteres').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use minúsculas, números e hífens')]);

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
            <input id="cat-name" maxLength={80} placeholder="Ex.: Kimonos" aria-invalid={form.formState.errors.name ? true : undefined} {...form.register('name')} />
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
            <input id="cg-name" maxLength={120} aria-invalid={e.name ? true : undefined} {...register('name')} />
            {e.name ? <p className={styles.fieldError}>{e.name.message}</p> : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="cg-slug">Slug</label>
            <input id="cg-slug" maxLength={120} placeholder={slugify(name)} aria-invalid={e.slug ? true : undefined} {...register('slug')} />
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
            <input id="cg-hero" type="url" inputMode="url" maxLength={2000} aria-invalid={e.heroImageUrl ? true : undefined} {...register('heroImageUrl')} />
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
            <textarea id="cg-desc" maxLength={5000} aria-invalid={e.description ? true : undefined} {...register('description')} />
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
          <legend className="visually-hidden">Produtos do catálogo</legend>
          {e.productIds ? <p className={styles.fieldError}>{e.productIds.message}</p> : null}
          <ProductPicker selected={selected} onChange={(ids) => form.setValue('productIds', ids, { shouldDirty: true, shouldValidate: true })} />
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
  const removeOne = useAdminMutation((id: string) => adminApi.deleteLink(id));
  const removeAll = useAdminMutation(() => adminApi.deleteAllLinks());
  const total = links.data?.items.length ?? 0;
  const now = Date.now();

  return (
    <div className={styles.page}>
      <PageHeader
        title="Links exclusivos"
        description="Compartilham uma seleção sem expor o catálogo. O token não dá acesso ao painel."
        actions={
          can('catalog:write') && total ? (
            <Button
              size="sm"
              variant="danger"
              loading={removeAll.isPending}
              onClick={() => {
                if (window.confirm(`Apagar os ${total} links? Quem recebeu um link deixa de conseguir abrir. Os pedidos já feitos continuam no sistema. Não dá para desfazer.`)) removeAll.mutate(undefined);
              }}
            >
              Apagar todos
            </Button>
          ) : null
        }
      />
      {removeAll.isSuccess ? <Alert tone="success">{removeAll.data.deleted} links apagados.</Alert> : null}
      {removeOne.isError || removeAll.isError ? <Alert tone="danger">{errorMessage(removeOne.error ?? removeAll.error)}</Alert> : null}
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
              <input id="lk-label" maxLength={120} placeholder="Ex.: Equipe de competição" aria-invalid={le.label ? true : undefined} {...form.register('label')} />
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
                <th scope="col"><span className="visually-hidden">Ações</span></th>
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
                    <td>
                      {can('catalog:write') ? (
                        <button
                          type="button"
                          className={`${styles.linkButton} ${styles.dangerButton}`}
                          aria-label={`Apagar link ${l.label}`}
                          disabled={removeOne.isPending && removeOne.variables === l.id}
                          onClick={() => {
                            if (window.confirm(`Apagar o link "${l.label}"? Quem recebeu deixa de conseguir abrir. Não dá para desfazer.`)) removeOne.mutate(l.id);
                          }}
                        >
                          Apagar
                        </button>
                      ) : null}
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
