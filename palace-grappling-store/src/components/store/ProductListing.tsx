import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CloseIcon, FilterIcon } from '@/components/icons';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { type Facets, type ProductQuery, storefrontApi, storefrontKeys } from '@/lib/api/storefront';
import type { Page, PublicCategory, PublicProduct, SalesContext } from '@/lib/api/types';
import { ApiError } from '@/lib/api/client';
import { ProductGrid, ProductGridSkeleton } from './ProductCard';
import styles from './listing.module.css';

// Listagem com filtros guardados na URL (compartilháveis e com "voltar" funcionando).
// Parâmetros: categoria, linha, tamanho, cor, disponivel, ordem, pagina, q.

const SORTS: { value: NonNullable<ProductQuery['sort']>; label: string }[] = [
  { value: 'relevance', label: 'Relevância' },
  { value: 'newest', label: 'Lançamentos' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
];

const LINE_LABELS: Record<string, string> = { gi: 'Gi', 'no-gi': 'No-Gi', acessorios: 'Acessórios' };
export const lineLabel = (line: string) => LINE_LABELS[line] ?? line;

export function useListingQuery(fixed: Partial<ProductQuery> = {}): ProductQuery {
  const [params] = useSearchParams();
  const sort = params.get('ordem');
  return {
    pageSize: 24,
    page: Math.max(1, Number(params.get('pagina')) || 1),
    sort: SORTS.some((s) => s.value === sort) ? (sort as ProductQuery['sort']) : 'relevance',
    category: params.get('categoria') ?? undefined,
    line: params.get('linha') ?? undefined,
    size: params.get('tamanho') ?? undefined,
    color: params.get('cor') ?? undefined,
    inStock: params.get('disponivel') === '1' ? true : undefined,
    search: params.get('q') ?? undefined,
    ...fixed,
  };
}

interface Props {
  query: ProductQuery;
  fetcher: (q: ProductQuery) => Promise<Page<PublicProduct>>;
  queryKey: readonly unknown[];
  facets: Facets | undefined;
  categories?: PublicCategory[];
  context?: SalesContext;
  hide?: ('category' | 'line')[];
}

export function ProductListing({ query, fetcher, queryKey, facets, categories, context, hide = [] }: Props) {
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const products = useQuery({ queryKey: [...queryKey, query], queryFn: () => fetcher(query), placeholderData: keepPreviousData });

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    if (key !== 'pagina') next.delete('pagina');
    setParams(next, { preventScrollReset: key !== 'pagina' });
  };
  const toggle = (key: string, value: string) => set(key, params.get(key) === value ? null : value);
  const active = ['categoria', 'linha', 'tamanho', 'cor', 'disponivel', 'q'].filter((k) => params.has(k) && !(hide.includes('line') && k === 'linha'));

  const data = products.data;
  return (
    <div className={styles.listing}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.filterToggle} aria-expanded={filtersOpen} aria-controls="filtros" onClick={() => setFiltersOpen((v) => !v)}>
          <FilterIcon size={16} /> Filtros{active.length ? ` (${active.length})` : ''}
        </button>
        <p className={styles.count} aria-live="polite">
          {data ? `${data.total} ${data.total === 1 ? 'produto' : 'produtos'}` : ' '}
        </p>
        <label className={styles.sort}>
          <span className="mono">Ordenar</span>
          <select value={query.sort} onChange={(e) => set('ordem', e.target.value === 'relevance' ? null : e.target.value)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div id="filtros" className={`${styles.filters} ${filtersOpen ? styles.filtersOpen : ''}`}>
        {categories && !hide.includes('category') && categories.length ? (
          <fieldset className={styles.group}>
            <legend className="mono">Categoria</legend>
            {categories.map((c) => (
              <button key={c.id} type="button" className={styles.chip} aria-pressed={query.category === c.slug} onClick={() => toggle('categoria', c.slug)}>
                {c.name}
              </button>
            ))}
          </fieldset>
        ) : null}
        {facets?.lines.length && !hide.includes('line') ? (
          <fieldset className={styles.group}>
            <legend className="mono">Linha</legend>
            {facets.lines.map((l) => (
              <button key={l} type="button" className={styles.chip} aria-pressed={query.line === l} onClick={() => toggle('linha', l)}>
                {lineLabel(l)}
              </button>
            ))}
          </fieldset>
        ) : null}
        {facets?.sizes.length ? (
          <fieldset className={styles.group}>
            <legend className="mono">Tamanho</legend>
            {facets.sizes.map((s) => (
              <button key={s} type="button" className={`${styles.chip} ${styles.size}`} aria-pressed={query.size === s} onClick={() => toggle('tamanho', s)}>
                {s}
              </button>
            ))}
          </fieldset>
        ) : null}
        {facets?.colors.length ? (
          <fieldset className={styles.group}>
            <legend className="mono">Cor</legend>
            {facets.colors.map((c) => (
              <button key={c.name} type="button" className={styles.chip} aria-pressed={query.color === c.name} onClick={() => toggle('cor', c.name)}>
                <span className={styles.swatch} style={{ background: c.hex ?? 'transparent' }} aria-hidden="true" />
                {c.name}
              </button>
            ))}
          </fieldset>
        ) : null}
        <fieldset className={styles.group}>
          <legend className="mono">Disponibilidade</legend>
          <button type="button" className={styles.chip} aria-pressed={query.inStock === true} onClick={() => toggle('disponivel', '1')}>
            Só em estoque
          </button>
        </fieldset>
        {active.length ? (
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              const next = new URLSearchParams(params);
              active.forEach((k) => next.delete(k));
              next.delete('pagina');
              setParams(next);
            }}
          >
            <CloseIcon size={14} /> Limpar filtros
          </button>
        ) : null}
      </div>

      <div className={styles.results} aria-busy={products.isFetching}>
        {products.isPending ? (
          <ProductGridSkeleton count={8} />
        ) : products.isError ? (
          <Alert tone="danger" title="Não foi possível carregar os produtos">
            {products.error instanceof ApiError ? products.error.message : 'Verifique sua conexão e tente novamente.'}
          </Alert>
        ) : data && data.items.length ? (
          <>
            <ProductGrid products={data.items} context={context} />
            {data.totalPages > 1 ? <Pagination page={data.page} totalPages={data.totalPages} onChange={(p) => set('pagina', p === 1 ? null : String(p))} /> : null}
          </>
        ) : (
          <EmptyState title="Nada encontrado com esses filtros">
            {active.length ? 'Tente remover algum filtro.' : 'Novos produtos chegam em breve.'} <Link to="/loja">Ver toda a loja</Link>
          </EmptyState>
        )}
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1);
  return (
    <nav aria-label="Paginação" className={styles.pagination}>
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </button>
      <ol>
        {pages.map((p, i) => (
          <li key={p}>
            {i > 0 && p - pages[i - 1]! > 1 ? <span aria-hidden="true">…</span> : null}
            <button type="button" aria-current={p === page ? 'page' : undefined} onClick={() => onChange(p)}>
              {p}
            </button>
          </li>
        ))}
      </ol>
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Próxima
      </button>
    </nav>
  );
}

/** Cabeçalho editorial das listagens: título gigante + contador. */
export function ListingHero({ title, description, children }: { title: string; description?: string | null; children?: React.ReactNode }) {
  return (
    <header className={`container ${styles.hero}`}>
      <h1 className={styles.heroTitle}>
        {title}
        <span className={styles.dot}>.</span>
      </h1>
      {description ? <p className={styles.heroText}>{description}</p> : null}
      {children}
    </header>
  );
}

export function useFacets(catalog?: string) {
  return useQuery({ queryKey: storefrontKeys.facets(catalog), queryFn: () => storefrontApi.facets(catalog), staleTime: 60_000 });
}
