import type { ArtKind } from '@/components/media/Placeholder';

/**
 * Mídia editorial da loja (hero, banners, inspiração, página "sobre").
 *
 * COMO TROCAR PELAS FOTOS OFICIAIS:
 *  1. Coloque o arquivo em `public/media/` (ex.: `public/media/hero.jpg`, 2400px de largura, JPG/WebP).
 *  2. Preencha `src` do slot correspondente (ex.: `src: '/media/hero.jpg'`) e revise o `alt`.
 *  3. Enquanto `src` for null, a loja mostra uma ilustração marcada como "Foto temporária".
 *
 * Fotos de PRODUTO não ficam aqui: são enviadas pelo painel (Supabase Storage) e
 * chegam pela API com o texto alternativo cadastrado.
 */
export interface MediaSlot {
  src: string | null;
  alt: string;
  /** Ilustração temporária usada enquanto não há foto. */
  art: ArtKind;
  /** Briefing da foto que deve substituir a ilustração. */
  brief: string;
}

export const media = {
  hero: {
    src: null,
    alt: 'Atleta de kimono preto ajustando a faixa antes do treino',
    art: 'kimono',
    brief: 'Atleta de kimono preto, plano americano, luz lateral dura',
  },
  heroDrop: { src: null, alt: 'Rash guard do novo lançamento', art: 'rashguard', brief: 'Rash guard do drop, fundo neutro' },
  gi: { src: null, alt: 'Detalhe da gola de um kimono trançado', art: 'kimono', brief: 'Gi: gola e lapela em close' },
  noGi: { src: null, alt: 'Atleta em posição de guarda usando rash guard e shorts', art: 'rashguard', brief: 'No-Gi: atleta em guarda, P&B' },
  manifesto: { src: null, alt: 'Faixa preta amarrada, com graus na ponteira', art: 'belt', brief: 'Faixa preta com 4 graus em close' },
  culture1: { src: null, alt: 'Atletas cumprimentando-se no tatame', art: 'kimono', brief: 'Cumprimento no tatame' },
  culture2: { src: null, alt: 'Pegada na manga durante um rola', art: 'kimono', brief: 'Pegada na manga, close' },
  inspiration: [
    { src: null, alt: 'Look de treino com rash guard e spats', art: 'spats', brief: 'Look No-Gi completo' },
    { src: null, alt: 'Atleta chegando à academia com bolsa de treino', art: 'bag', brief: 'Chegada à academia' },
    { src: null, alt: 'Shorts de luta em movimento', art: 'shorts', brief: 'Shorts em movimento' },
    { src: null, alt: 'Kimono branco dobrado sobre o tatame', art: 'kimono', brief: 'Kimono dobrado no tatame' },
  ],
  about: { src: null, alt: 'Treino coletivo em uma academia de Jiu-Jitsu', art: 'kimono', brief: 'Treino coletivo, plano aberto' },
} satisfies Record<string, MediaSlot | MediaSlot[]>;

/** Ilustração temporária por linha/categoria quando o produto ainda não tem foto. */
export function artForProduct(product: { line: string | null; category: { slug: string } | null }): ArtKind {
  const slug = product.category?.slug ?? '';
  if (slug.includes('kimono')) return 'kimono';
  if (slug.includes('rash')) return 'rashguard';
  if (slug.includes('short')) return 'shorts';
  if (slug.includes('legging') || slug.includes('calca') || slug.includes('spats')) return 'spats';
  if (slug.includes('acessor')) return 'belt';
  return product.line === 'gi' ? 'kimono' : 'rashguard';
}
