import type { MediaSlot } from '@/content/media';
import { artForProduct } from '@/content/media';
import type { PublicProduct } from '@/lib/api/types';
import { Placeholder } from './Placeholder';
import styles from './media.module.css';

/** Foto editorial: usa o arquivo oficial quando configurado, senão a ilustração temporária. */
export function Media({ slot, className, tone, eager }: { slot: MediaSlot; className?: string; tone?: 'dark' | 'paper'; eager?: boolean }) {
  return (
    <div className={[styles.frame, className].filter(Boolean).join(' ')}>
      {slot.src ? (
        <img src={slot.src} alt={slot.alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      ) : (
        <Placeholder art={slot.art} label={slot.alt} brief={slot.brief} tone={tone} />
      )}
    </div>
  );
}

type ProductLike = Pick<PublicProduct, 'name' | 'images' | 'line' | 'category'>;

/** Foto de produto vinda da API; sem foto cadastrada, ilustração temporária da categoria. */
export function ProductImage({ product, index = 0, className, eager }: { product: ProductLike; index?: number; className?: string; eager?: boolean }) {
  const image = product.images[index];
  return (
    <div className={[styles.frame, className].filter(Boolean).join(' ')}>
      {image ? (
        <img src={image.url} alt={image.alt || product.name} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      ) : (
        <Placeholder art={artForProduct(product)} label={product.name} />
      )}
    </div>
  );
}
