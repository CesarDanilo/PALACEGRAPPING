import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { z } from '@/lib/zod';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import { adminApi, type AdminProduct } from '@/lib/api/admin';
import { centsSchema, skuSchema, stockSchema, toNumber } from '@/lib/validation';
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

const hexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida');

/** Variante: SKU obrigatório; tamanho e cor curtos; estoque inteiro e não negativo. */
const variantSchema = z.object({
  sku: skuSchema,
  size: z.string().trim().max(20, 'Máximo de 20 caracteres'),
  color: z.string().trim().max(40, 'Máximo de 40 caracteres'),
  colorHex: hexSchema,
  stock: stockSchema,
});
type VariantForm = z.infer<typeof variantSchema>;

const productSchema = z
  .object({
    name: z.string().trim().min(2, 'Mínimo de 2 caracteres').max(160, 'Máximo de 160 caracteres'),
    slug: z.union([z.literal(''), z.string().max(120, 'Máximo de 120 caracteres').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use minúsculas, números e hífens')]),
    description: z.string().max(10_000, 'Máximo de 10.000 caracteres'),
    categoryId: z.string(),
    line: z.string().max(40, 'Máximo de 40 caracteres'),
    tags: z
      .string()
      .refine((v) => v.split(',').filter((t) => t.trim()).length <= 30, 'No máximo 30 tags')
      .refine((v) => v.split(',').every((t) => t.trim().length <= 40), 'Cada tag com até 40 caracteres'),
    price: centsSchema,
    salePrice: centsSchema.nullable(),
    sizeGuide: z.string().max(10_000, 'Máximo de 10.000 caracteres'),
    shippingInfo: z.string().max(2_000, 'Máximo de 2.000 caracteres'),
    isActive: z.boolean(),
    isFeatured: z.boolean(),
    variants: z.array(variantSchema).max(100, 'No máximo 100 variantes'),
  })
  .refine((v) => v.salePrice == null || v.salePrice < v.price, { path: ['salePrice'], message: 'O promocional deve ser menor que o preço' })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.variants.forEach((variant, i) => {
      const sku = variant.sku.trim().toUpperCase();
      if (seen.has(sku)) ctx.addIssue({ code: 'custom', path: ['variants', i, 'sku'], message: 'SKU repetido' });
      seen.add(sku);
    });
  });
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
  variants: p ? [] : [{ sku: '', size: '', color: '', colorHex: '#0a0a0a', stock: 0 }],
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
  const form = useForm<ProductForm>({ resolver: zodResolver(productSchema), defaultValues: toForm(product) });
  const { register, handleSubmit, control, formState, getValues } = form;
  const variantFields = useFieldArray({ control, name: 'variants' });

  const save = useAdminMutation(async (values: ProductForm) => {
    if (product) return adminApi.updateProduct(product.id, toInput(values));
    const variants = values.variants.map((d, position) => ({
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
        <fieldset disabled={readOnly} className={styles.page} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
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
              {e.variants?.root?.message || e.variants?.message ? <p className={styles.fieldError}>{e.variants.root?.message ?? e.variants.message}</p> : null}
              <ol className={styles.variantList}>
                {variantFields.fields.map((field, i) => {
                  const ve = e.variants?.[i];
                  const id = (name: string) => `v-${i}-${name}`;
                  return (
                    <li key={field.id} className={styles.variantRow}>
                      <span className={styles.variantIndex} aria-hidden="true">{i + 1}</span>
                      <div className={styles.field}>
                        <label htmlFor={id('sku')}>SKU</label>
                        <input id={id('sku')} autoCapitalize="characters" aria-invalid={ve?.sku ? true : undefined} aria-describedby={ve?.sku ? id('sku-err') : undefined} {...register(`variants.${i}.sku`)} />
                        {ve?.sku ? <p id={id('sku-err')} className={styles.fieldError}>{ve.sku.message}</p> : null}
                      </div>
                      <div className={styles.field}>
                        <label htmlFor={id('size')}>Tamanho</label>
                        <input id={id('size')} aria-invalid={ve?.size ? true : undefined} {...register(`variants.${i}.size`)} />
                        {ve?.size ? <p className={styles.fieldError}>{ve.size.message}</p> : null}
                      </div>
                      <div className={styles.field}>
                        <label htmlFor={id('color')}>Cor</label>
                        <div className={styles.colorInput}>
                          <input type="color" aria-label={`Tom da cor da variante ${i + 1}`} {...register(`variants.${i}.colorHex`)} />
                          <input id={id('color')} aria-invalid={ve?.color ? true : undefined} {...register(`variants.${i}.color`)} />
                        </div>
                        {ve?.color ? <p className={styles.fieldError}>{ve.color.message}</p> : null}
                      </div>
                      <div className={styles.field}>
                        <label htmlFor={id('stock')}>Estoque inicial</label>
                        <input id={id('stock')} type="number" inputMode="numeric" min={0} step={1} aria-invalid={ve?.stock ? true : undefined} {...register(`variants.${i}.stock`, { setValueAs: (v: string | number) => (typeof v === 'number' ? v : toNumber(v)) })} />
                        {ve?.stock ? <p className={styles.fieldError}>{ve.stock.message}</p> : null}
                      </div>
                      <button type="button" className={styles.linkButton} aria-label={`Remover variante ${i + 1}`} disabled={variantFields.fields.length === 1} onClick={() => variantFields.remove(i)}>
                        Remover
                      </button>
                    </li>
                  );
                })}
              </ol>
              <button
                type="button"
                className={styles.linkButton}
                disabled={variantFields.fields.length >= 100}
                onClick={() => {
                  const last = getValues('variants').at(-1);
                  variantFields.append({ sku: '', size: '', color: last?.color ?? '', colorHex: last?.colorHex ?? '#0a0a0a', stock: 0 });
                }}
              >
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
  const blank: VariantForm = { sku: '', size: '', color: '', colorHex: '#0a0a0a', stock: 0 };
  const form = useForm<VariantForm>({ resolver: zodResolver(variantSchema), defaultValues: blank });
  const ve = form.formState.errors;
  const add = useAdminMutation(
    (v: VariantForm) =>
      adminApi.addVariant(product.id, {
        sku: v.sku.trim().toUpperCase(),
        size: v.size.trim() || null,
        color: v.color.trim() || null,
        colorHex: v.color.trim() ? v.colorHex : null,
        price: null,
        salePrice: null,
        isActive: true,
        position: product.variants.length,
        stock: v.stock,
      }),
    () => form.reset({ ...blank, color: form.getValues('color'), colorHex: form.getValues('colorHex') }),
  );
  const toggle = useAdminMutation((v: { id: string; isActive: boolean }) => adminApi.updateVariant(product.id, v.id, { isActive: v.isActive }));

  return (
    <Panel title="Variantes">
      {add.isError ? <Alert tone="danger">{errorMessage(add.error)}</Alert> : null}
      {toggle.isError ? <Alert tone="danger">{errorMessage(toggle.error)}</Alert> : null}
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Variantes cadastradas">
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
      </div>
      {!readOnly ? (
        <form className={`${styles.variantRow} ${styles.variantAdd}`} noValidate onSubmit={form.handleSubmit((v) => add.mutate(v))}>
          <div className={styles.field}>
            <label htmlFor="nv-sku">SKU</label>
            <input id="nv-sku" autoCapitalize="characters" aria-invalid={ve.sku ? true : undefined} {...form.register('sku')} />
            {ve.sku ? <p className={styles.fieldError}>{ve.sku.message}</p> : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="nv-size">Tamanho</label>
            <input id="nv-size" aria-invalid={ve.size ? true : undefined} {...form.register('size')} />
            {ve.size ? <p className={styles.fieldError}>{ve.size.message}</p> : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="nv-color">Cor</label>
            <div className={styles.colorInput}>
              <input type="color" aria-label="Tom da cor" {...form.register('colorHex')} />
              <input id="nv-color" aria-invalid={ve.color ? true : undefined} {...form.register('color')} />
            </div>
            {ve.color ? <p className={styles.fieldError}>{ve.color.message}</p> : null}
          </div>
          <div className={styles.field}>
            <label htmlFor="nv-stock">Estoque inicial</label>
            <input id="nv-stock" type="number" inputMode="numeric" min={0} step={1} aria-invalid={ve.stock ? true : undefined} {...form.register('stock', { setValueAs: (v: string | number) => (typeof v === 'number' ? v : toNumber(v)) })} />
            {ve.stock ? <p className={styles.fieldError}>{ve.stock.message}</p> : null}
          </div>
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
