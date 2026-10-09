import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router';
import { ListingHero } from '@/components/store/ProductListing';
import { Button } from '@/components/ui/Button';
import { Alert, LoadingState } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { cart, useCart } from '@/features/cart/cart-store';
import { problemLabel, useQuote } from '@/features/cart/useQuote';
import { checkoutDefaults, checkoutSchema, UFS, type CheckoutForm, type CheckoutValues } from '@/features/checkout/checkout-schema';
import { checkoutAttemptKey, clearCheckoutAttempt } from '@/features/checkout/idempotency';
import { saveTrackingToken } from '@/features/checkout/tracking';
import { ApiError } from '@/lib/api/client';
import { storefrontApi } from '@/lib/api/storefront';
import { formatMoney } from '@/lib/money';
import { OrderSummary } from './CartPage';
import styles from './checkout.module.css';

export function CheckoutPage() {
  const state = useCart();
  const quote = useQuote(state);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // Depois do pedido criado o carrinho é limpo; não redirecionar de volta ao carrinho vazio.
  const placed = useRef(false);
  const { register, handleSubmit, formState, watch } = useForm<CheckoutForm, unknown, CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: checkoutDefaults,
  });
  const method = watch('paymentMethod');

  if (!state.items.length && !placed.current) return <Navigate to="/carrinho" replace />;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    if (!quote.data?.valid) {
      setError('Revise o carrinho antes de finalizar.');
      return;
    }
    const items = state.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    try {
      const result = await storefrontApi.placeOrder(
        {
          items,
          context: state.context,
          customer: { name: values.name, phone: values.phone, email: values.email || null },
          address: {
            zipCode: values.zipCode,
            street: values.street,
            number: values.number,
            complement: values.complement || null,
            district: values.district,
            city: values.city,
            state: values.state,
          },
          paymentMethod: values.paymentMethod,
          notes: values.notes || null,
          acceptTerms: true,
          // A API recusa se o total recalculado for diferente do que o comprador viu.
          expectedTotal: quote.data.total,
        },
        checkoutAttemptKey(items),
      );
      saveTrackingToken(result.order.number, result.trackingToken);
      clearCheckoutAttempt();
      placed.current = true;
      cart.clear();
      if (result.payment?.status === 'READY' && result.payment.checkoutUrl) {
        // Pagamento no ambiente seguro do provedor; a confirmação chega por webhook.
        window.location.assign(result.payment.checkoutUrl);
        return;
      }
      navigate(`/checkout/sucesso?pedido=${encodeURIComponent(result.order.number)}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PRICE_CHANGED') {
        await queryClient.invalidateQueries({ queryKey: ['quote'] });
        setError('Os valores mudaram desde que você abriu o carrinho. Confira o novo total e confirme de novo.');
      } else if (e instanceof ApiError && e.code === 'INSUFFICIENT_STOCK') {
        await queryClient.invalidateQueries({ queryKey: ['quote'] });
        setError('Um item ficou sem estoque enquanto você finalizava. Ajuste o carrinho.');
      } else {
        setError(e instanceof ApiError ? e.message : 'Não foi possível criar o pedido. Verifique sua conexão.');
      }
    }
  });

  const e = formState.errors;
  return (
    <>
      <ListingHero title="Finalizar compra" />
      <form className={`container ${styles.layout}`} onSubmit={onSubmit} noValidate>
        <div className={styles.form}>
          {error ? (
            <Alert tone="danger" title="Pedido não criado">
              {error}
            </Alert>
          ) : null}

          <fieldset className={styles.fieldset}>
            <legend>
              <span className="mono">01 /</span> Identificação
            </legend>
            <TextField label="Nome completo" autoComplete="name" error={e.name?.message} {...register('name')} />
            <div className={styles.row}>
              <TextField label="Telefone (WhatsApp)" type="tel" inputMode="tel" autoComplete="tel" error={e.phone?.message} {...register('phone')} />
              <TextField label="E-mail (opcional)" type="email" autoComplete="email" hint="Para receber a confirmação." error={e.email?.message} {...register('email')} />
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>
              <span className="mono">02 /</span> Entrega
            </legend>
            <div className={styles.row}>
              <TextField label="CEP" inputMode="numeric" autoComplete="postal-code" error={e.zipCode?.message} {...register('zipCode')} />
              <SelectField label="Estado" options={UFS.map((uf) => ({ value: uf, label: uf }))} autoComplete="address-level1" error={e.state?.message} {...register('state')} />
            </div>
            <TextField label="Rua" autoComplete="address-line1" error={e.street?.message} {...register('street')} />
            <div className={styles.row}>
              <TextField label="Número" error={e.number?.message} {...register('number')} />
              <TextField label="Complemento" autoComplete="address-line2" error={e.complement?.message} {...register('complement')} />
            </div>
            <div className={styles.row}>
              <TextField label="Bairro" error={e.district?.message} {...register('district')} />
              <TextField label="Cidade" autoComplete="address-level2" error={e.city?.message} {...register('city')} />
            </div>
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend>
              <span className="mono">03 /</span> Pagamento
            </legend>
            <div className={styles.methods}>
              <label className={styles.method}>
                <input type="radio" value="PIX" {...register('paymentMethod')} />
                <span>
                  <strong>Pix</strong> Aprovação na hora, pelo app do seu banco.
                </span>
              </label>
              <label className={styles.method}>
                <input type="radio" value="CARD" {...register('paymentMethod')} />
                <span>
                  <strong>Cartão de crédito</strong> Parcelamento disponível no ambiente seguro do provedor.
                </span>
              </label>
            </div>
            <p className={styles.small}>
              {method === 'PIX' ? 'Você verá o QR Code Pix' : 'Você informará o cartão'} na página segura do provedor de pagamento. Esta loja não recebe dados de cartão.
            </p>
            <TextField label="Observações (opcional)" error={e.notes?.message} {...register('notes')} />
            <label className={styles.terms}>
              <input type="checkbox" aria-invalid={e.acceptTerms ? true : undefined} aria-describedby={e.acceptTerms ? 'terms-error' : undefined} {...register('acceptTerms')} />
              <span>
                Li e aceito os <Link to="/politicas" target="_blank">termos de compra, trocas e privacidade</Link>.
              </span>
            </label>
            {e.acceptTerms ? (
              <p id="terms-error" className={styles.fieldError} role="alert">
                {e.acceptTerms.message}
              </p>
            ) : null}
          </fieldset>
        </div>

        {quote.isPending ? (
          <LoadingState label="Calculando…" />
        ) : quote.data ? (
          <OrderSummary quote={quote.data}>
            <ul className={styles.summaryItems}>
              {quote.data.lines.map((l) => (
                <li key={l.variantId}>
                  <span>
                    {l.quantity}× {l.productName} <span className="mono">{l.variantLabel}</span>
                    {l.problem ? <em className={styles.problem}> {problemLabel[l.problem]}</em> : null}
                  </span>
                  <span>{formatMoney(l.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <Button type="submit" block loading={formState.isSubmitting} disabled={!quote.data.valid}>
              Confirmar pedido
            </Button>
            <p className={styles.small}>O pedido só é considerado pago após a confirmação do provedor.</p>
          </OrderSummary>
        ) : (
          <Alert tone="danger">Não foi possível calcular o total.</Alert>
        )}
      </form>
    </>
  );
}
