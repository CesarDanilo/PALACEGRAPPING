import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProductCard } from '@/components/store/ProductCard';
import { Countdown } from '@/components/store/Sections';
import { Media } from '@/components/media/Media';
import { __resetCart, cart } from '@/features/cart/cart-store';
import type { PublicProduct, PublicVariant } from '@/lib/api/types';

const variant = (over: Partial<PublicVariant> = {}): PublicVariant => ({
  id: crypto.randomUUID(),
  sku: 'SKU',
  size: null,
  color: null,
  colorHex: null,
  price: 12900,
  compareAtPrice: null,
  availability: 'ok',
  ...over,
});

const product = (variants: PublicVariant[], over: Partial<PublicProduct> = {}): PublicProduct => ({
  id: crypto.randomUUID(),
  slug: 'faixa',
  name: 'Faixa Premium',
  description: '',
  line: 'gi',
  tags: [],
  category: { id: 'c', name: 'Acessórios', slug: 'acessorios' },
  price: 12900,
  salePrice: null,
  priceRange: { min: 12900, max: 12900 },
  sizeGuide: null,
  shippingInfo: null,
  isFeatured: false,
  releasedAt: null,
  availability: 'ok',
  images: [],
  variants,
  ...over,
});

const renderCard = (p: PublicProduct) =>
  render(
    <MemoryRouter>
      <ProductCard product={p} />
    </MemoryRouter>,
  );

describe('card de produto', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetCart();
  });

  it('com uma única variante, o "+" adiciona direto ao carrinho', async () => {
    renderCard(product([variant()]));
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar Faixa Premium ao carrinho' }));
    expect(cart.get().items).toHaveLength(1);
  });

  it('com tamanhos para escolher, o "+" leva à página do produto (seleção obrigatória)', () => {
    renderCard(product([variant({ size: 'A1' }), variant({ size: 'A2' })]));
    expect(screen.queryByRole('button', { name: /Adicionar/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Escolher tamanho de Faixa Premium' })).toHaveAttribute('href', '/produto/faixa');
  });

  it('esgotado não oferece compra e mostra o selo', () => {
    renderCard(product([variant({ availability: 'out' })], { availability: 'out' }));
    expect(screen.getByText('Esgotado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Adicionar/ })).toBeNull();
  });

  it('sem foto cadastrada, mostra ilustração identificada como temporária', () => {
    renderCard(product([variant()]));
    expect(screen.getByRole('img', { name: 'Faixa Premium (ilustração temporária)' })).toBeInTheDocument();
    expect(screen.getByText(/Foto temporária/)).toBeInTheDocument();
  });
});

describe('mídia editorial', () => {
  it('usa a foto oficial quando configurada', () => {
    render(<Media slot={{ src: '/media/hero.jpg', alt: 'Atleta', art: 'kimono', brief: 'x' }} />);
    expect(screen.getByRole('img', { name: 'Atleta' })).toHaveAttribute('src', '/media/hero.jpg');
    expect(screen.queryByText(/Foto temporária/)).toBeNull();
  });
});

describe('contagem regressiva', () => {
  it('anuncia o tempo restante e encerra no passado', () => {
    const { rerender } = render(<Countdown endsAt={new Date(Date.now() + 2 * 86_400_000 + 60_000).toISOString()} />);
    expect(screen.getByText(/Termina em 2 dias/)).toBeInTheDocument();
    rerender(<Countdown key="past" endsAt={new Date(Date.now() - 1000).toISOString()} />);
    expect(screen.getByText('Campanha encerrada')).toBeInTheDocument();
  });
});
