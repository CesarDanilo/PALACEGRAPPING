import { randomUUID } from 'node:crypto';
import { canMovePayment, type PaymentMethod } from '../../domain/payments/payment-status.js';
import { AppError, notFound } from '../../shared/errors.js';
import type { Logger } from '../../shared/logger.js';
import { applyTransition } from '../orders/order.service.js';
import type { UnitOfWork } from '../ports/repositories.js';
import type { OrderRecord, PaymentRecord } from '../ports/records.js';
import type { Clock, PaymentProvider, WebhookRequest } from '../ports/services.js';

export type CheckoutStart =
  | { status: 'READY'; payment: PaymentRecord }
  | { status: 'NOT_CONFIGURED' }
  | { status: 'FAILED'; message: string };

export class PaymentService {
  private readonly providers: Map<string, PaymentProvider>;

  constructor(
    private readonly uow: UnitOfWork,
    providers: PaymentProvider[],
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly urls: { storefront: string; publicApi: string },
  ) {
    this.providers = new Map(providers.map((p) => [p.name, p]));
  }

  /** Provedor padrão: o primeiro configurado. */
  private get active(): PaymentProvider | undefined {
    return [...this.providers.values()].find((p) => p.configured);
  }

  /**
   * Cria (ou reaproveita) a cobrança no provedor para um pedido pendente.
   * O pedido nunca é marcado como pago aqui: isso só acontece por confirmação do provedor.
   */
  async startCheckout(order: OrderRecord, method: PaymentMethod = order.paymentMethod): Promise<CheckoutStart> {
    const provider = this.active;
    if (!provider) return { status: 'NOT_CONFIGURED' };
    if (order.status !== 'PENDING_PAYMENT') {
      throw new AppError('INVALID_STATE_TRANSITION', 'Este pedido não aguarda pagamento');
    }

    const existing = (await this.uow.repos.payments.listForOrder(order.tenantId, order.id)).find(
      (p) => p.status === 'PENDING' && p.method === method && p.provider === provider.name && p.checkoutUrl,
    );
    if (existing) return { status: 'READY', payment: existing };

    const payment = await this.uow.repos.payments.create(order.tenantId, {
      orderId: order.id,
      provider: provider.name,
      method,
      amount: order.total,
      externalReference: randomUUID(),
    });
    try {
      const checkout = await provider.createCheckout({
        tenantId: order.tenantId,
        orderId: order.id,
        orderNumber: order.number,
        externalReference: payment.externalReference,
        method,
        amount: order.total,
        currency: order.currency,
        payer: { name: order.customerName, email: order.customerEmail, phone: order.customerPhone },
        // A soma dos itens enviados precisa bater com o total do pedido; o frete entra como item.
        items: [
          ...order.items.map((i) => ({ title: `${i.productName} (${i.variantLabel})`, quantity: i.quantity, unitPrice: i.unitPrice })),
          ...(order.shippingTotal > 0 ? [{ title: 'Frete', quantity: 1, unitPrice: order.shippingTotal }] : []),
        ],
        returnUrl: `${this.urls.storefront}/checkout/sucesso?pedido=${encodeURIComponent(order.number)}`,
        notificationUrl: `${this.urls.publicApi}/api/v1/webhooks/payments/${provider.name}`,
        expiresAt: order.paymentExpiresAt,
      });
      await this.uow.repos.payments.attachCheckout(order.tenantId, payment.id, checkout);
      return { status: 'READY', payment: { ...payment, ...checkout } };
    } catch (error) {
      this.logger.error({ err: error, orderId: order.id }, 'falha ao criar cobrança no provedor');
      await this.uow.repos.payments.update(order.tenantId, payment.id, { status: 'CANCELLED', rawStatus: 'checkout_creation_failed' });
      return { status: 'FAILED', message: 'Não foi possível iniciar o pagamento agora. Tente novamente em instantes.' };
    }
  }

  /**
   * Processa uma notificação do provedor:
   *  1. valida a assinatura;
   *  2. registra o evento (duplicados são ignorados);
   *  3. consulta o estado real do pagamento no provedor (o corpo do webhook não é fonte de verdade);
   *  4. aplica a transição do pagamento, do pedido e a receita financeira numa única transação.
   */
  async handleWebhook(providerName: string, request: WebhookRequest): Promise<{ result: string }> {
    const provider = this.providers.get(providerName);
    if (!provider || !provider.configured) throw notFound('Provedor de pagamento');

    const parsed = provider.parseWebhook(request);
    const event = await this.uow.repos.paymentEvents.begin({ provider: provider.name, eventKey: parsed.eventKey, type: parsed.type, payload: request.body });
    if (!event) return { result: 'duplicate' };

    if (!parsed.externalPaymentId) {
      await this.uow.repos.paymentEvents.finish(event.id, { tenantId: null, paymentId: null, result: 'ignored' });
      return { result: 'ignored' };
    }

    const remote = await provider.fetchPayment(parsed.externalPaymentId);
    const payment = await this.uow.repos.payments.findByExternalReference(remote.externalReference);
    if (!payment || payment.provider !== provider.name) {
      await this.uow.repos.paymentEvents.finish(event.id, { tenantId: null, paymentId: null, result: 'unknown-reference' });
      return { result: 'unknown-reference' };
    }

    const result = await this.uow.transaction(async (repos) => {
      const locked = await repos.payments.lock(payment.tenantId, payment.id);
      if (!locked) return 'missing';
      const now = this.clock.now();

      if (locked.status === remote.status) {
        if (!locked.externalId) await repos.payments.update(locked.tenantId, locked.id, { externalId: remote.externalId, rawStatus: remote.rawStatus });
        return 'unchanged';
      }
      if (!canMovePayment(locked.status, remote.status)) return `ignored-${locked.status}-to-${remote.status}`;

      await repos.payments.update(locked.tenantId, locked.id, {
        status: remote.status,
        externalId: remote.externalId,
        rawStatus: remote.rawStatus,
        approvedAt: remote.status === 'APPROVED' ? (remote.approvedAt ?? now) : undefined,
      });

      if (remote.status === 'APPROVED') {
        if (remote.amount !== locked.amount) {
          this.logger.warn({ paymentId: locked.id, expected: locked.amount, received: remote.amount }, 'valor pago diverge do pedido');
          return 'amount-mismatch';
        }
        const order = await repos.orders.findById(locked.tenantId, locked.orderId);
        if (!order) return 'order-missing';
        const income = await repos.finance.ensureIncomeForPayment(locked.tenantId, {
          categoryId: (await repos.finance.findSystemCategory(locked.tenantId, 'INCOME', 'Vendas'))?.id ?? null,
          description: `Pedido ${order.number}`,
          amount: locked.amount,
          competenceDate: order.createdAt,
          paidAt: remote.approvedAt ?? now,
          paymentMethod: locked.method,
          orderId: order.id,
          paymentId: locked.id,
        });
        if (order.status !== 'PENDING_PAYMENT') {
          // Ex.: pagamento aprovado depois da expiração. Requer conferência manual (estorno ou reativação).
          this.logger.warn({ orderId: order.id, status: order.status }, 'pagamento aprovado para pedido que não aguardava pagamento');
          return income ? 'approved-order-not-pending' : 'approved-duplicate';
        }
        await applyTransition(repos, order, { status: 'PAID', note: `Pagamento ${remote.externalId} aprovado` }, { userId: null, source: `payment-webhook:${provider.name}` }, now);
        return 'approved';
      }
      if (remote.status === 'REFUNDED') {
        await repos.finance.cancelIncomeForPayment(locked.tenantId, locked.id);
        return 'refunded';
      }
      // REJECTED/CANCELLED/EXPIRED: o pedido segue aguardando até o prazo, permitindo nova tentativa.
      return remote.status.toLowerCase();
    });

    await this.uow.repos.paymentEvents.finish(event.id, { tenantId: payment.tenantId, paymentId: payment.id, result });
    return { result };
  }
}
