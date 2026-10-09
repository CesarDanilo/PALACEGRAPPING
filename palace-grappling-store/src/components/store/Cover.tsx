import { useQuery } from '@tanstack/react-query';
import { storefrontApi, storefrontKeys, type ProductQuery } from '@/lib/api/storefront';
import styles from './cover.module.css';

/**
 * Capa de categoria/catálogo: usa a foto principal do primeiro produto com foto.
 * Não há campo de imagem em categoria; a capa acompanha o catálogo real.
 */
export function useCoverImage(source: { category?: string; catalog?: string; hero?: string | null }) {
  const query: ProductQuery = { category: source.category, pageSize: 8, sort: 'relevance' };
  const result = useQuery({
    queryKey: source.catalog ? storefrontKeys.catalog(source.catalog, { pageSize: 8 }) : storefrontKeys.products(query),
    queryFn: async () => (source.catalog ? (await storefrontApi.catalog(source.catalog, { pageSize: 8 })).products : storefrontApi.products(query)),
    enabled: !source.hero,
    staleTime: 5 * 60_000,
  });
  if (source.hero) return { url: source.hero, alt: '' };
  const product = result.data?.items.find((p) => p.images.length);
  return product ? { url: product.images[0]!.url, alt: product.images[0]!.alt || product.name } : null;
}

/** Imagem de fundo decorativa com degradê para manter o texto legível. */
export function CoverBackground({ source }: { source: Parameters<typeof useCoverImage>[0] }) {
  const cover = useCoverImage(source);
  if (!cover) return null;
  return (
    <span className={styles.background} aria-hidden="true">
      <img src={cover.url} alt="" loading="lazy" decoding="async" />
    </span>
  );
}

/** Faixa de imagem para o topo de listagens (categoria e catálogo). */
export function CoverBanner({ source }: { source: Parameters<typeof useCoverImage>[0] }) {
  const cover = useCoverImage(source);
  if (!cover) return null;
  return (
    <div className={styles.banner}>
      <img src={cover.url} alt={cover.alt} decoding="async" fetchPriority="high" />
    </div>
  );
}
