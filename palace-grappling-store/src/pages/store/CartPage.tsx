import { Link, useNavigate } from 'react-router';
import { MinusIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { Placeholder } from '@/components/media/Placeholder';
import { ListingHero } from '@/components/store/ProductListing';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { cart, MAX_QUANTITY, useCart } from '@/features/cart/cart-store';
import { problemLabel, useQuote } from '@/features/cart/useQuote';
import type { Quote } from '@/lib/api/types';
import { formatMoney } from '@/lib/money';
import styles from './checkout.module.css';

export function OrderSummary({ quote, children }: { quote: Quote; children?: React.ReactNode }) {
  return (
    <aside className={styles.summary} aria-labelledby="resumo">
      <h2 id="resumo" className={styles.summaryTitle}>
        Resumo
      </h2>
      <dl className={styles.totals}>
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMoney(quote.subtotal, quote.currency)}</dd>
        </div>
        <div>
          <dt>Frete</dt>
          <dd>{quote.shipping === 0 ? 'Grátis' : formatMoney(quote.shipping, quote.currency)}</dd>
        </div>
        {quote.discount > 0 ? (
          <div>
            <dt>Desconto</dt>
            <dd>−{formatMoney(quote.discount, quote.currency)}</dd>
          </div>
        ) : null}
        <div className={styles.total}>
          <dt>Total</dt>
          <dd>{formatMoney(quote.total, quote.currency)}</dd>
        </div>
      </dl>
      {children}
    </aside>
  );
}

export function CartPage() {
  const state = useCart();
  const quote = useQuote(state);
  const navigate = useNavigate();

  if (!state.items.length) {
    return (
      <>
        <ListingHero title="Carrinho" />
        <div className="container">
          <EmptyState title="Seu carrinho está vazio">
            <Link to="/loja">Ir para a loja</Link>
          </EmptyState>
        </div>
      </>
    );
  }

  const lines = new Map(quote.data?.lines.map((l) => [l.variantId, l]));
  return (
    <>
      <ListingHero title="Carrinho" />
      <div className={`container ${styles.layout}`}>
        <section aria-label="Itens do carrinho">
          {quote.isError ? <Alert tone="danger">Não foi possível atualizar preços e estoque agora. Tente novamente.</Alert> : null}
          <ul className={styles.items}>
            {state.items.map((item) => {
              const line = lines.get(item.variantId);
              const problem = line?.problem;
              return (
                <li key={item.variantId} className={styles.item}>
                  <Link to={`/produto/${item.productSlug}`} className={styles.itemImage} tabIndex={-1} aria-hidden="true">
                    {item.imageUrl ? <img src={item.imageUrl} alt="" /> : <Placeholder art="kimono" label={item.productName} />}
                  </Link>
                  <div className={styles.itemInfo}>
                    <Link to={`/produto/${item.productSlug}`} className={styles.itemName}>
                      {item.productName}
                    </Link>
                    <span className="mono">{item.variantLabel}</span>
                    {problem ? (
                      <span className={styles.problem} role="status">
                        {problemLabel[problem]}
                        {problem === 'INSUFFICIENT_STOCK' && line ? ` (disponível: ${line.availableStock})` : ''}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.itemQty} role="group" aria-label={`Quantidade de ${item.productName}`}>
                    <button type="button" aria-label="Diminuir" disabled={item.quantity <= 1} onClick={() => cart.setQuantity(item.variantId, item.quantity - 1)}>
                      <MinusIcon size={14} />
                    </button>
                    <output aria-live="polite">{item.quantity}</output>
                    <button type="button" aria-label="Aumentar" disabled={item.quantity >= MAX_QUANTITY} onClick={() => cart.setQuantity(item.variantId, item.quantity + 1)}>
                      <PlusIcon size={14} />
                    </button>
                  </div>
                  <div className={styles.itemPrice}>
                    {line ? formatMoney(line.lineTotal) : formatMoney(item.previewUnitPrice * item.quantity)}
                    {line && line.quantity > 1 ? <span>{formatMoney(line.unitPrice)} cada</span> : null}
                  </div>
                  <button type="button" className={styles.remove} aria-label={`Remover ${item.productName}`} onClick={() => cart.remove(item.variantId)}>
                    <TrashIcon size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        {quote.isPending ? (
          <LoadingState label="Calculando…" />
        ) : quote.data ? (
          <OrderSummary quote={quote.data}>
            {!quote.data.valid ? <Alert tone="warning">Ajuste os itens marcados para continuar.</Alert> : null}
            <Button block disabled={!quote.data.valid} onClick={() => navigate('/checkout')}>
              Finalizar compra
            </Button>
            <Link to="/loja" className={styles.continue}>
              Continuar comprando
            </Link>
          </OrderSummary>
        ) : null}
      </div>
    </>
  );
}
