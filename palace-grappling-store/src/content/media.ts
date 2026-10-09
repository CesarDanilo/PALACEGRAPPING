import type { ArtKind } from '@/components/media/Placeholder';

/**
 * Mídia editorial da loja (hero, banners, inspiração, página "sobre").
 *
 * COMO TROCAR AS FOTOS:
 *  1. Coloque o arquivo em `public/media/` (WebP, até ~1800 px de largura; converta PNG/JPG antes).
 *  2. Aponte `src` do slot para ele (ex.: `src: '/media/hero.webp'`) e revise o `alt`.
 *  3. Com `src: null`, a loja mostra uma ilustração marcada como "Foto temporária".
 *
 * As fotos atuais são de produtos Suerte (fornecidas pela loja ou do catálogo dela).
 * Fotos de PRODUTO não ficam aqui: são enviadas pelo painel e chegam pela API.
 */
export interface MediaSlot {
  src: string | null;
  alt: string;
  /** Ilustração usada se `src` ficar vazio. */
  art: ArtKind;
  /** Briefing da foto ideal para o slot. */
  brief: string;
}

export const media = {
  hero: {
    src: '/media/hero.webp',
    alt: 'Atleta tatuado vestindo kimono preto com bordados dourados, em fundo escuro',
    art: 'kimono',
    brief: 'Atleta de kimono preto, plano americano, luz lateral dura',
  },
  heroDrop: { src: '/media/hero-drop.webp', alt: 'Rash guard Suerte Apex em detalhe', art: 'rashguard', brief: 'Rash guard do drop, fundo neutro' },
  gi: { src: '/media/gi.webp', alt: 'Kimono preto Suerte com bordado nas costas', art: 'kimono', brief: 'Gi: kimono em destaque' },
  noGi: { src: '/media/no-gi.webp', alt: 'Atleta de costas usando rash guard Suerte com estampa de águia', art: 'rashguard', brief: 'No-Gi: atleta de rash guard' },
  manifesto: { src: '/media/manifesto.webp', alt: 'Detalhe de kimono preto com bordado e faixa roxa', art: 'belt', brief: 'Faixa e bordado em close' },
  culture1: { src: '/media/culture-1.webp', alt: 'Atleta vestindo kimono preto Suerte', art: 'kimono', brief: 'Atleta de kimono' },
  culture2: { src: '/media/culture-2.webp', alt: 'Detalhe do bordado na manga de um kimono preto', art: 'kimono', brief: 'Detalhe de bordado' },
  inspiration: [
    { src: '/media/inspiration-1.webp', alt: 'Bermuda No-Gi Suerte com o S bordado', art: 'shorts', brief: 'Bermuda No-Gi' },
    { src: '/media/inspiration-2.webp', alt: 'Calça legging Suerte para treino No-Gi', art: 'spats', brief: 'Legging de treino' },
    { src: '/media/inspiration-3.webp', alt: 'Bordado em azul na gola de um kimono branco', art: 'kimono', brief: 'Detalhe de kimono' },
    { src: '/media/inspiration-4.webp', alt: 'Faixa branca de Jiu-Jitsu Suerte enrolada', art: 'belt', brief: 'Faixa de Jiu-Jitsu' },
  ],
  about: { src: '/media/about.webp', alt: 'Costas de kimono preto com o bordado "Pressure Creates Champions"', art: 'kimono', brief: 'Kimono em destaque' },
} satisfies Record<string, MediaSlot | MediaSlot[]>;

/** Ilustração por linha/categoria quando o produto ainda não tem foto. */
export function artForProduct(product: { line: string | null; category: { slug: string } | null }): ArtKind {
  const slug = product.category?.slug ?? '';
  if (slug.includes('kimono')) return 'kimono';
  if (slug.includes('rash')) return 'rashguard';
  if (slug.includes('short')) return 'shorts';
  if (slug.includes('legging') || slug.includes('calca') || slug.includes('spats')) return 'spats';
  if (slug.includes('acessor')) return 'belt';
  return product.line === 'gi' ? 'kimono' : 'rashguard';
}
