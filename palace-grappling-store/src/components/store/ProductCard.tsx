import { Link } from 'react-router';
import { PlusIcon } from '@/components/icons';
import { ProductImage } from '@/components/media/Media';
import { notify } from '@/components/ui/Toast';
import { cart } from '@/features/cart/cart-store';
import { variantLabelOf } from '@/features/catalog/variant-selection';
import type { PublicProduct, SalesContext } from '@/lib/api/types';
import { Price } from './Price';
import styles from './store.module.css';

/**
 * Card de produto: foto sangrando, nome e preço sobrepostos na base e botão "+".
 * O "+" só adiciona direto quando existe uma única variante disponível; havendo
 * escolha de tamanho/cor, leva à página do produto (seleção obrigatória).
 */
export function ProductCard({ product, context, index, eager }: { product: PublicProduct; context?: SalesContext; index?: number; eager?: boolean }) {
  const available = product.variants.filter((v) => v.availability !== 'out');
  const single = product.variants.length === 1 && available.length === 1 ? available[0] : null;
  const href = `/produto/${product.slug}`;
  const soldOut = product.availability === 'out';
  const onSale = product.variants.some((v) => v.compareAtPrice != null);

  return (
    <article className={styles.card}>
      <Link to={href} state={context ? { context } : undefined} className={styles.cardLink}>
        <ProductImage product={product} className={styles.cardImage} eager={eager} />
        <span className={styles.cardMeta}>
          {index != null ? <span className={styles.cardIndex}>{String(index + 1).padStart(2, '0')}</span> : null}
          <span className={styles.cardName}>{product.name}</span>
          <Price min={product.priceRange.min} max={product.priceRange.max} compareAt={onSale ? product.price : null} />
        </span>
        {soldOut ? <span className={styles.cardFlag}>Esgotado</span> : onSale ? <span className={`${styles.cardFlag} ${styles.cardFlagSale}`}>Oferta</span> : null}
      </Link>
      {single ? (
        <button
          type="button"
          className={styles.quickAdd}
          aria-label={`Adicionar ${product.name} ao carrinho`}
          onClick={() => {
            cart.add(
              {
                variantId: single.id,
                productSlug: product.slug,
                productName: product.name,
                variantLabel: variantLabelOf(single),
                imageUrl: product.images[0]?.url ?? null,
                previewUnitPrice: single.price,
              },
              1,
              context,
            );
            notify(`${product.name} no carrinho`, { to: '/carrinho', label: 'Ver carrinho' });
          }}
        >
          <PlusIcon size={18} />
        </button>
      ) : !soldOut ? (
        <Link to={href} state={context ? { context } : undefined} className={styles.quickAdd} aria-label={`Escolher tamanho de ${product.name}`}>
          <PlusIcon size={18} />
        </Link>
      ) : null}
    </article>
  );
}

/** `eagerCount`: cards da primeira linha carregam a foto sem esperar a rolagem (listagens no topo da página). */
export function ProductGrid({ products, context, numbered, columns = 4, eagerCount = 0 }: { products: PublicProduct[]; context?: SalesContext; numbered?: boolean; columns?: 3 | 4; eagerCount?: number }) {
  return (
    <ul className={`${styles.grid} ${columns === 3 ? styles.grid3 : ''}`}>
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} context={context} index={numbered ? i : undefined} eager={i < eagerCount} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className={styles.grid} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={styles.skeleton} />
      ))}
    </ul>
  );
}
