import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import { adminApi, type AdminProduct, type VariantInput } from '@/lib/api/admin';
import { MoneyField, PageHeader, Pager, Panel, errorMessage, money, useAdminKey, useAdminMutation } from './common';
import styles from './admin.module.css';

export function ProductsPage() {
  const key = useAdminKey();
  const { can } = useAdminSession();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const page = Number(params.get('pagina') ?? 1);
  const products = useQuery({
    queryKey: key('products', search, page),
    queryFn: () => adminApi.products({ search: search || undefined, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className={styles.page}>
      <PageHeader
        title="Produtos"
        description="Cadastro, variantes, fotos e status."
        actions={can('catalog:write') ? <Link to="/admin/produtos/novo" className={styles.linkButton}>Novo produto</Link> : null}
      />
      <form
        role="search"
        className={styles.toolbar}
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get('q');
          setParams(q ? { q: String(q) } : {});
        }}
      >
        <label className="visually-hidden" htmlFor="busca-produtos">
          Buscar por nome ou SKU
        </label>
        <input id="busca-produtos" name="q" defaultValue={search} placeholder="Nome ou SKU" />
        <Button size="sm" variant="secondary" type="submit">
          Buscar
        </Button>
      </form>
      <Panel>
        {products.isPending ? (
          <LoadingState />
        ) : products.isError ? (
          <Alert tone="danger">{errorMessage(products.error)}</Alert>
        ) : !products.data.items.length ? (
          <EmptyState title="Nenhum produto encontrado" />
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Produto</th>
                  <th scope="col">Categoria</th>
                  <th scope="col" className={styles.num}>Preço</th>
                  <th scope="col" className={styles.num}>Estoque</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {products.data.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/admin/produtos/${p.id}`} className={styles.rowLink}>
                        {p.name}
                      </Link>
                      <div className={styles.muted}>{p.variants.length} variantes · {p.images.length} fotos</div>
                    </td>
                    <td>{p.category?.name ?? '—'}</td>
                    <td className={styles.num}>
                      {p.salePrice != null ? (
                        <>
                          {money(p.salePrice)} <s className={styles.muted}>{money(p.price)}</s>
                        </>
                      ) : (
                        money(p.price)
                      )}
                    </td>
                    <td className={styles.num}>{p.variants.reduce((s, v) => s + v.stock, 0)}</td>
                    <td>{p.isActive ? 'Ativo' : 'Inativo'}{p.isFeatured ? ' · Destaque' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager
              page={products.data.page}
              totalPages={products.data.totalPages}
              onChange={(p) => setParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('pagina', String(p));
                return next;
              })}
            />
          </>
        )}
      </Panel>
    </div>
  );
}

const productSchema = z
  .object({
    name: z.string().trim().min(2, 'Mínimo de 2 caracteres').max(160),
    slug: z.union([z.literal(''), z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use minúsculas, números e hífens')]),
    description: z.string().max(10_000),
    categoryId: z.string(),
    line: z.string().max(40),
    tags: z.string(),
    price: z.number({ error: 'Informe o preço' }).int().min(0),
    salePrice: z.number().int().min(0).nullable(),
    sizeGuide: z.string().max(10_000),
    shippingInfo: z.string().max(2_000),
    isActive: z.boolean(),
    isFeatured: z.boolean(),
  })
  .refine((v) => v.salePrice == null || v.salePrice < v.price, { path: ['salePrice'], message: 'O promocional deve ser menor que o preço' });
type ProductForm = z.infer<typeof productSchema>;

const toForm = (p?: AdminProduct): ProductForm => ({
  name: p?.name ?? '',
  slug: p?.slug ?? '',
  description: p?.description ?? '',
  categoryId: p?.categoryId ?? '',
  line: p?.line ?? '',
  tags: p?.tags.join(', ') ?? '',
  price: p?.price ?? (undefined as unknown as number),
  salePrice: p?.salePrice ?? null,
  sizeGuide: p?.sizeGuide ?? '',
  shippingInfo: p?.shippingInfo ?? '',
  isActive: p?.isActive ?? true,
  isFeatured: p?.isFeatured ?? false,
});

const toInput = (v: ProductForm) => ({
  name: v.name,
  ...(v.slug ? { slug: v.slug } : {}),
  description: v.description,
  categoryId: v.categoryId || null,
  line: v.line.trim() || null,
  tags: v.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
  price: v.price,
  salePrice: v.salePrice,
  sizeGuide: v.sizeGuide.trim() || null,
  shippingInfo: v.shippingInfo.trim() || null,
  isActive: v.isActive,
  isFeatured: v.isFeatured,
  releasedAt: null,
});

interface DraftVariant {
  sku: string;
  size: string;
  color: string;
  colorHex: string;
  stock: number;
}

export function ProductEditorPage() {
  const { id } = useParams();
  const key = useAdminKey();
  const product = useQuery({ queryKey: key('product', id), queryFn: () => adminApi.product(id!), enabled: Boolean(id) });
  if (id && product.isPending) return <LoadingState />;
  if (id && product.isError) return <Alert tone="danger">{errorMessage(product.error)}</Alert>;
  return <ProductEditor key={product.data?.id ?? 'novo'} product={product.data} />;
}

function ProductEditor({ product }: { product?: AdminProduct }) {
  const key = useAdminKey();
  const navigate = useNavigate();
  const { can } = useAdminSession();
  const readOnly = !can('catalog:write');
  const categories = useQuery({ queryKey: key('categories'), queryFn: adminApi.categories });
  const [drafts, setDrafts] = useState<DraftVariant[]>([{ sku: '', size: '', color: '', colorHex: '#0a0a0a', stock: 0 }]);
  const form = useForm<ProductForm>({ resolver: zodResolver(productSchema), defaultValues: toForm(product) });
  const { register, handleSubmit, control, formState } = form;

  const save = useAdminMutation(async (values: ProductForm) => {
    if (product) return adminApi.updateProduct(product.id, toInput(values));
    const variants = drafts
      .filter((d) => d.sku.trim())
      .map((d, position) => ({
        sku: d.sku.trim().toUpperCase(),
        size: d.size.trim() || null,
        color: d.color.trim() || null,
        colorHex: d.color.trim() ? d.colorHex : null,
        price: null,
        salePrice: null,
        isActive: true,
        position,
        stock: d.stock,
      }));
    return adminApi.createProduct({ ...toInput(values), variants });
  }, (saved) => {
    if (!product) navigate(`/admin/produtos/${saved.id}`, { replace: true });
  });
  const remove = useAdminMutation(() => adminApi.deleteProduct(product!.id), () => navigate('/admin/produtos'));

  const e = formState.errors;
  return (
    <div className={styles.page}>
      <PageHeader
        title={product ? product.name : 'Novo produto'}
        description={product ? `/${product.slug}` : 'Preços em reais; a loja recalcula tudo no servidor.'}
        actions={
          product && !readOnly ? (
            <Button
              variant="danger"
              size="sm"
              loading={remove.isPending}
              onClick={() => {
                if (window.confirm('Desativar este produto? Ele sai da loja; pedidos antigos continuam intactos.')) remove.mutate(undefined);
              }}
            >
              Desativar
            </Button>
          ) : null
        }
      />
      {save.isError ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
      {save.isSuccess && product ? <Alert tone="success">Alterações salvas.</Alert> : null}

      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
        <fieldset disabled={readOnly} className={styles.page} style={{ border: 0, padding: 0, margin: 0 }}>
          <Panel title="Dados">
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="p-name">Nome</label>
                <input id="p-name" aria-invalid={e.name ? true : undefined} {...register('name')} />
                {e.name ? <p className={styles.fieldError}>{e.name.message}</p> : null}
              </div>
              <div className={styles.field}>
                <label htmlFor="p-slug">Slug (URL)</label>
                <input id="p-slug" placeholder="gerado a partir do nome" aria-invalid={e.slug ? true : undefined} {...register('slug')} />
                {e.slug ? <p className={styles.fieldError}>{e.slug.message}</p> : null}
              </div>
              <div className={styles.field}>
                <label htmlFor="p-cat">Categoria</label>
                <select id="p-cat" {...register('categoryId')}>
                  <option value="">Sem categoria</option>
                  {categories.data?.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="p-line">Linha</label>
                <input id="p-line" list="lines" placeholder="gi, no-gi…" {...register('line')} />
                <datalist id="lines">
                  <option value="gi" />
                  <option value="no-gi" />
                  <option value="acessorios" />
                </datalist>
              </div>
              <Controller
                control={control}
                name="price"
                render={({ field }) => <MoneyField label="Preço" value={field.value ?? null} onChange={(v) => field.onChange(v ?? undefined)} error={e.price?.message} />}
              />
              <Controller
                control={control}
                name="salePrice"
                render={({ field }) => <MoneyField label="Preço promocional (opcional)" optional value={field.value} onChange={field.onChange} error={e.salePrice?.message} />}
              />
              <div className={`${styles.field} ${styles.span2}`}>
                <label htmlFor="p-desc">Descrição</label>
                <textarea id="p-desc" {...register('description')} />
              </div>
              <div className={styles.field}>
                <label htmlFor="p-tags">Tags (separadas por vírgula)</label>
                <input id="p-tags" {...register('tags')} />
              </div>
              <div className={styles.field}>
                <label htmlFor="p-ship">Informação de entrega (opcional)</label>
                <input id="p-ship" {...register('shippingInfo')} />
              </div>
              <div className={`${styles.field} ${styles.span2}`}>
                <label htmlFor="p-guide">Guia de tamanhos (texto, opcional)</label>
                <textarea id="p-guide" placeholder={'A1 · altura 1,70–1,80 m · peso 70–80 kg'} {...register('sizeGuide')} />
              </div>
              <div className={styles.actions}>
                <label className={styles.check}>
                  <input type="checkbox" {...register('isActive')} /> Ativo na loja
                </label>
                <label className={styles.check}>
                  <input type="checkbox" {...register('isFeatured')} /> Destaque na home
                </label>
              </div>
            </div>
          </Panel>

          {!product ? (
            <Panel title="Variantes e estoque inicial">
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">SKU</th>
                    <th scope="col">Tamanho</th>
                    <th scope="col">Cor</th>
                    <th scope="col">Hex</th>
                    <th scope="col">Estoque</th>
                    <th scope="col"><span className="visually-hidden">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d, i) => {
                    const setField = (patch: Partial<DraftVariant>) => setDrafts((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                    return (
                      <tr key={i}>
                        <td><input className={styles.inlineInput} aria-label={`SKU da variante ${i + 1}`} value={d.sku} onChange={(ev) => setField({ sku: ev.target.value })} /></td>
                        <td><input className={styles.inlineInput} aria-label={`Tamanho da variante ${i + 1}`} value={d.size} onChange={(ev) => setField({ size: ev.target.value })} /></td>
                        <td><input className={styles.inlineInput} aria-label={`Cor da variante ${i + 1}`} value={d.color} onChange={(ev) => setField({ color: ev.target.value })} /></td>
                        <td><input type="color" aria-label={`Cor (hex) da variante ${i + 1}`} value={d.colorHex} onChange={(ev) => setField({ colorHex: ev.target.value })} /></td>
                        <td><input className={styles.inlineInput} type="number" min={0} aria-label={`Estoque da variante ${i + 1}`} value={d.stock} onChange={(ev) => setField({ stock: Math.max(0, Number(ev.target.value)) })} /></td>
                        <td>
                          <button type="button" className={styles.linkButton} onClick={() => setDrafts((all) => all.filter((_, j) => j !== i))}>
                            Remover
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button type="button" className={styles.linkButton} onClick={() => setDrafts((all) => [...all, { sku: '', size: '', color: all.at(-1)?.color ?? '', colorHex: all.at(-1)?.colorHex ?? '#0a0a0a', stock: 0 }])}>
                Adicionar variante
              </button>
            </Panel>
          ) : null}

          {!readOnly ? (
            <div>
              <Button type="submit" loading={save.isPending}>
                {product ? 'Salvar alterações' : 'Criar produto'}
              </Button>
            </div>
          ) : null}
        </fieldset>
      </form>

      {product ? <VariantsPanel product={product} readOnly={readOnly} /> : null}
      {product ? <ImagesPanel product={product} readOnly={readOnly} /> : null}
    </div>
  );
}

function VariantsPanel({ product, readOnly }: { product: AdminProduct; readOnly: boolean }) {
  const [draft, setDraft] = useState<VariantInput & { stock: number }>({ sku: '', size: null, color: null, colorHex: null, price: null, salePrice: null, isActive: true, position: product.variants.length, stock: 0 });
  const add = useAdminMutation(() => adminApi.addVariant(product.id, { ...draft, sku: draft.sku.trim().toUpperCase() }), () =>
    setDraft((d) => ({ ...d, sku: '', size: null, stock: 0, position: d.position + 1 })),
  );
  const toggle = useAdminMutation((v: { id: string; isActive: boolean }) => adminApi.updateVariant(product.id, v.id, { isActive: v.isActive }));

  return (
    <Panel title="Variantes">
      {add.isError ? <Alert tone="danger">{errorMessage(add.error)}</Alert> : null}
      {toggle.isError ? <Alert tone="danger">{errorMessage(toggle.error)}</Alert> : null}
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">SKU</th>
            <th scope="col">Tamanho</th>
            <th scope="col">Cor</th>
            <th scope="col" className={styles.num}>Preço próprio</th>
            <th scope="col" className={styles.num}>Estoque</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {product.variants.map((v) => (
            <tr key={v.id}>
              <td className={styles.code}>{v.sku}</td>
              <td>{v.size ?? '—'}</td>
              <td>
                {v.colorHex ? <span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: v.colorHex, marginRight: 6 }} /> : null}
                {v.color ?? '—'}
              </td>
              <td className={styles.num}>{v.price != null ? money(v.price) : 'do produto'}</td>
              <td className={styles.num}>
                <Link to={`/admin/estoque?variante=${v.id}`}>{v.stock}</Link>
              </td>
              <td>
                {readOnly ? (v.isActive ? 'Ativa' : 'Inativa') : (
                  <label className={styles.check}>
                    <input type="checkbox" checked={v.isActive} onChange={(e) => toggle.mutate({ id: v.id, isActive: e.target.checked })} /> Ativa
                  </label>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly ? (
        <form
          className={styles.toolbar}
          style={{ marginTop: 'var(--space-4)' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.sku.trim()) add.mutate(undefined);
          }}
        >
          <label className={styles.field}>
            <span>SKU</span>
            <input value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} required />
          </label>
          <label className={styles.field}>
            <span>Tamanho</span>
            <input value={draft.size ?? ''} onChange={(e) => setDraft({ ...draft, size: e.target.value || null })} />
          </label>
          <label className={styles.field}>
            <span>Cor</span>
            <input value={draft.color ?? ''} onChange={(e) => setDraft({ ...draft, color: e.target.value || null, colorHex: e.target.value ? (draft.colorHex ?? '#0a0a0a') : null })} />
          </label>
          <label className={styles.field}>
            <span>Estoque inicial</span>
            <input type="number" min={0} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: Math.max(0, Number(e.target.value)) })} />
          </label>
          <Button size="sm" type="submit" loading={add.isPending}>
            Adicionar variante
          </Button>
        </form>
      ) : null}
      <p className={styles.muted}>O estoque muda apenas por movimentações (entrada, saída, ajuste) para manter o histórico.</p>
    </Panel>
  );
}

function ImagesPanel({ product, readOnly }: { product: AdminProduct; readOnly: boolean }) {
  const [alt, setAlt] = useState('');
  const upload = useAdminMutation((file: File) => adminApi.uploadImage(product.id, file, alt || product.name), () => setAlt(''));
  const update = useAdminMutation((v: { id: string; body: { alt?: string; position?: number; isPrimary?: true } }) => adminApi.updateImage(product.id, v.id, v.body));
  const remove = useAdminMutation((imageId: string) => adminApi.deleteImage(product.id, imageId));
  const images = [...product.images].sort((a, b) => a.position - b.position);
  // Reordenar = trocar a posição com a vizinha (posições ficam sempre distintas).
  const swap = useAdminMutation(async ([a, b]: [number, number]) => {
    const first = images[a]!;
    const second = images[b]!;
    await adminApi.updateImage(product.id, first.id, { position: b });
    await adminApi.updateImage(product.id, second.id, { position: a });
  });
  const err = upload.error ?? update.error ?? remove.error ?? swap.error;

  return (
    <Panel title="Fotos">
      {err ? <Alert tone="danger">{errorMessage(err)}</Alert> : null}
      {images.length ? (
        <ul className={styles.imagesGrid}>
          {images.map((img, i) => (
            <li key={img.id}>
              <img src={img.url} alt={img.alt} />
              {img.isPrimary ? <span className={styles.primaryTag}>Principal</span> : null}
              {!readOnly ? (
                <>
                  <label className={styles.field}>
                    <span>Texto alternativo</span>
                    <input defaultValue={img.alt} onBlur={(e) => e.target.value !== img.alt && update.mutate({ id: img.id, body: { alt: e.target.value } })} />
                  </label>
                  <div className={styles.actions}>
                    {!img.isPrimary ? (
                      <button type="button" className={styles.linkButton} onClick={() => update.mutate({ id: img.id, body: { isPrimary: true } })}>
                        Principal
                      </button>
                    ) : null}
                    <button type="button" className={styles.linkButton} disabled={i === 0} onClick={() => swap.mutate([i, i - 1])}>
                      Antes
                    </button>
                    <button type="button" className={styles.linkButton} disabled={i === images.length - 1} onClick={() => swap.mutate([i, i + 1])}>
                      Depois
                    </button>
                    <button type="button" className={styles.linkButton} onClick={() => window.confirm('Excluir esta foto?') && remove.mutate(img.id)}>
                      Excluir
                    </button>
                  </div>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>Sem fotos: a loja mostra uma ilustração temporária.</p>
      )}
      {!readOnly ? (
        <div className={styles.toolbar} style={{ marginTop: 'var(--space-4)' }}>
          <label className={styles.field}>
            <span>Texto alternativo da nova foto</span>
            <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Ex.: kimono preto, vista frontal" />
          </label>
          <label className={styles.field}>
            <span>Arquivo (JPEG, PNG, WebP ou AVIF, até 5 MB)</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={upload.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
                e.target.value = '';
              }}
            />
          </label>
          {upload.isPending ? <span className={styles.muted}>Enviando…</span> : null}
        </div>
      ) : null}
    </Panel>
  );
}
