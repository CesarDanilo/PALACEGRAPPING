import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Slashes } from '@/brand/Brand';
import { FabricIcon, MinusIcon, PlusIcon, RulerIcon, ShieldIcon, TruckIcon } from '@/components/icons';
import { ProductImage } from '@/components/media/Media';
import { ProductGrid } from '@/components/store/ProductCard';
import { lineLabel } from '@/components/store/ProductListing';
import { Price } from '@/components/store/Price';
import { SectionHeader } from '@/components/store/Sections';
import { Button } from '@/components/ui/Button';
import { Alert, AvailabilityBadge, LoadingState } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { notify } from '@/components/ui/Toast';
import { cart, MAX_QUANTITY } from '@/features/cart/cart-store';
import { addToCartBlock, resolveVariant, unavailableSizes, variantAxes, variantLabelOf } from '@/features/catalog/variant-selection';
import { ApiError } from '@/lib/api/client';
import { storefrontApi, storefrontKeys } from '@/lib/api/storefront';
import type { PublicProduct, SalesContext } from '@/lib/api/types';
import { formatMoney } from '@/lib/money';
import styles from './product.module.css';

const blockMessage = {
  SELECT_SIZE: 'Selecione o tamanho',
  SELECT_COLOR: 'Selecione a cor',
  UNAVAILABLE: 'Indisponível nesta combinação',
} as const;

export function ProductPage() {
  const { slug = '' } = useParams();
  const query = useQuery({ queryKey: storefrontKeys.product(slug), queryFn: () => storefrontApi.product(slug), retry: false });

  if (query.isPending) return <LoadingState label="Carregando produto…" />;
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className={`container ${styles.error}`}>
        <Alert tone={notFound ? 'warning' : 'danger'} title={notFound ? 'Produto não encontrado' : 'Não foi possível carregar'}>
          {notFound ? 'Ele pode ter saído de linha.' : 'Tente novamente em instantes.'} <Link to="/loja">Ver a loja</Link>
        </Alert>
      </div>
    );
  }
  // key: reinicia a seleção ao navegar entre produtos.
  return <ProductView key={query.data.product.id} product={query.data.product} related={query.data.related} />;
}

function ProductView({ product, related }: { product: PublicProduct; related: PublicProduct[] }) {
  const location = useLocation();
  const context = (location.state as { context?: SalesContext } | null)?.context;
  const store = useQuery({ queryKey: storefrontKeys.store, queryFn: storefrontApi.store, staleTime: 5 * 60_000 });
  const axes = useMemo(() => variantAxes(product), [product]);
  const [size, setSize] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(axes.colors.length === 1 ? axes.colors[0]!.name : null);
  const [quantity, setQuantity] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [tried, setTried] = useState(false);

  const selection = { size, color };
  const variant = resolveVariant(product, selection);
  const block = addToCartBlock(product, selection);
  const soldOutSizes = unavailableSizes(product, color);
  const images = product.images.length ? product.images : [];
  const shipping = store.data?.shipping;

  const add = () => {
    setTried(true);
    if (block || !variant) return;
    cart.add(
      {
        variantId: variant.id,
        productSlug: product.slug,
        productName: product.name,
        variantLabel: variantLabelOf(variant),
        imageUrl: product.images[0]?.url ?? null,
        previewUnitPrice: variant.price,
      },
      quantity,
      context,
    );
    notify(`${product.name} (${variantLabelOf(variant)}) no carrinho`, { to: '/carrinho', label: 'Ver carrinho' });
  };

  return (
    <>
      <article className={`container ${styles.product}`}>
        <nav aria-label="Trilha" className={styles.breadcrumb}>
          <Link to="/loja">Loja</Link> /{' '}
          {product.category ? <Link to={`/categoria/${product.category.slug}`}>{product.category.name}</Link> : null}
        </nav>

        <section className={styles.gallery} aria-label="Fotos do produto">
          <div className={styles.mainImage}>
            <ProductImage product={product} index={imageIndex} eager />
          </div>
          {images.length > 1 ? (
            <ul className={styles.thumbs}>
              {images.map((img, i) => (
                <li key={img.id}>
                  <button type="button" aria-label={`Ver foto ${i + 1}: ${img.alt || product.name}`} aria-current={i === imageIndex} onClick={() => setImageIndex(i)}>
                    <img src={img.url} alt="" loading="lazy" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className={styles.buy} aria-labelledby="product-title">
          <p className="eyebrow">
            {product.line ? lineLabel(product.line) : 'Palace'} <Slashes /> {product.category?.name}
          </p>
          <h1 id="product-title" className={styles.title}>
            {product.name}
          </h1>
          <div className={styles.priceRow}>
            {variant ? (
              <Price min={variant.price} compareAt={variant.compareAtPrice} size="lg" />
            ) : (
              <Price min={product.priceRange.min} max={product.priceRange.max} compareAt={product.salePrice ? product.price : null} size="lg" />
            )}
            <AvailabilityBadge value={variant ? variant.availability : product.availability} />
          </div>

          {axes.colors.length > 1 ? (
            <fieldset className={styles.option}>
              <legend>
                Cor{color ? <span>: {color}</span> : null}
              </legend>
              <div className={styles.swatches} role="radiogroup" aria-label="Cor">
                {axes.colors.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    role="radio"
                    aria-checked={color === c.name}
                    aria-label={c.name}
                    className={styles.swatch}
                    style={{ background: c.hex ?? 'transparent' }}
                    onClick={() => setColor(c.name)}
                  />
                ))}
              </div>
            </fieldset>
          ) : null}

          {axes.requiresSize ? (
            <fieldset className={styles.option}>
              <legend>
                Tamanho{size ? <span>: {size}</span> : null}
                {product.sizeGuide ? (
                  <button type="button" className={styles.guideLink} onClick={() => setGuideOpen(true)}>
                    <RulerIcon size={16} /> Guia de tamanhos
                  </button>
                ) : null}
              </legend>
              <div className={styles.sizes} role="radiogroup" aria-label="Tamanho">
                {axes.sizes.map((s) => {
                  const out = soldOutSizes.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={size === s}
                      aria-disabled={out || undefined}
                      className={`${styles.size} ${out ? styles.sizeOut : ''}`}
                      onClick={() => !out && setSize(s)}
                    >
                      {s}
                      {out ? <span className="visually-hidden"> (esgotado)</span> : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <div className={styles.addRow}>
            <div className={styles.qty} role="group" aria-label="Quantidade">
              <button type="button" aria-label="Diminuir quantidade" disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                <MinusIcon size={16} />
              </button>
              <output aria-live="polite">{quantity}</output>
              <button type="button" aria-label="Aumentar quantidade" disabled={quantity >= MAX_QUANTITY} onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}>
                <PlusIcon size={16} />
              </button>
            </div>
            <Button type="button" onClick={add} block aria-describedby={block ? 'add-block' : undefined} disabled={tried && block === 'UNAVAILABLE'}>
              {block && tried ? blockMessage[block] : 'Adicionar ao carrinho'}
            </Button>
          </div>
          {block && tried ? (
            <p id="add-block" className={styles.blockMsg} role="alert">
              {block === 'UNAVAILABLE' ? 'Esta combinação está esgotada. Escolha outro tamanho ou cor.' : `${blockMessage[block]} para continuar.`}
            </p>
          ) : null}
          <p className={styles.note}>Preço e estoque são confirmados no fechamento do pedido.</p>

          <ul className={styles.features}>
            <li>
              <TruckIcon size={22} />
              <span>
                <strong>Entrega</strong>
                {product.shippingInfo ??
                  (shipping?.mode === 'FREE'
                    ? 'Frete grátis para todo o Brasil.'
                    : shipping
                      ? `Frete fixo de ${formatMoney(shipping.flatRate)}${shipping.freeShippingThreshold ? `, grátis acima de ${formatMoney(shipping.freeShippingThreshold)}` : ''}.`
                      : 'Calculado no carrinho.')}
              </span>
            </li>
            <li>
              <ShieldIcon size={22} />
              <span>
                <strong>Compra segura</strong>Pagamento por Pix ou cartão em ambiente do provedor.
              </span>
            </li>
            {variant ? (
              <li>
                <FabricIcon size={22} />
                <span>
                  <strong>Referência</strong>
                  <span className="mono">{variant.sku}</span>
                </span>
              </li>
            ) : null}
          </ul>

          {product.description ? (
            <section className={styles.description} aria-labelledby="descricao">
              <h2 id="descricao" className="eyebrow">
                Descrição
              </h2>
              <p>{product.description}</p>
            </section>
          ) : null}
        </section>
      </article>

      {/* CTA fixo no mobile */}
      <div className={styles.stickyBar}>
        <span className={styles.stickyName}>{product.name}</span>
        <Button type="button" size="sm" onClick={add}>
          {block && tried ? blockMessage[block] : 'Adicionar'}
        </Button>
      </div>

      {related.length ? (
        <section className={`container ${styles.related}`} aria-labelledby="relacionados">
          <SectionHeader id="relacionados" title="Combina com" eyebrow="Relacionados" />
          <ProductGrid products={related} context={context} />
        </section>
      ) : null}

      {product.sizeGuide ? (
        <Modal open={guideOpen} onClose={() => setGuideOpen(false)} title="Guia de tamanhos">
          <pre className={styles.guide}>{product.sizeGuide}</pre>
        </Modal>
      ) : null}
    </>
  );
}
