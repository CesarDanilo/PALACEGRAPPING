import type {
  CreateCheckoutInput,
  CreatedCheckout,
  ParsedWebhook,
  PaymentProvider,
  ProviderPayment,
  WebhookRequest,
} from '../../application/ports/services.js';
import type { PaymentStatus } from '../../domain/payments/payment-status.js';
import { AppError, unauthenticated } from '../../shared/errors.js';
import { hmacSha256Hex, safeEqual } from '../../shared/crypto.js';
import { cents } from '../../shared/money.js';

const API = 'https://api.mercadopago.com';

/** Mapeamento dos status do Mercado Pago (https://www.mercadopago.com.br/developers/pt/reference/payments/_payments_id/get). */
export function mapMercadoPagoStatus(status: string): PaymentStatus {
  switch (status) {
    case 'approved':
      return 'APPROVED';
    case 'rejected':
      return 'REJECTED';
    case 'cancelled':
      return 'CANCELLED';
    case 'refunded':
    case 'charged_back':
      return 'REFUNDED';
    default:
      // pending, in_process, authorized, in_mediation
      return 'PENDING';
  }
}

/**
 * Valida o cabeçalho x-signature do Mercado Pago.
 * Manifesto: `id:{data.id};request-id:{x-request-id};ts:{ts};` assinado com HMAC-SHA256.
 * Partes ausentes são omitidas do manifesto, conforme a documentação.
 */
export function verifyMercadoPagoSignature(params: {
  secret: string;
  signatureHeader: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
  toleranceSeconds?: number;
  now?: Date;
}): boolean {
  if (!params.signatureHeader) return false;
  const parts = Object.fromEntries(
    params.signatureHeader.split(',').map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k, v.join('=')];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  if (params.toleranceSeconds) {
    const tsMs = ts.length > 10 ? Number(ts) : Number(ts) * 1000;
    if (Math.abs((params.now ?? new Date()).getTime() - tsMs) > params.toleranceSeconds * 1000) return false;
  }
  const dataId = params.dataId && /^[a-z0-9]+$/i.test(params.dataId) ? params.dataId.toLowerCase() : params.dataId;
  let manifest = '';
  if (dataId) manifest += `id:${dataId};`;
  if (params.requestId) manifest += `request-id:${params.requestId};`;
  manifest += `ts:${ts};`;
  return safeEqual(hmacSha256Hex(params.secret, manifest), v1);
}

const toAmount = (value: number) => Math.round(value) / 100;

/**
 * Checkout Pro do Mercado Pago (Pix e cartão em página segura do provedor).
 * Esta API nunca recebe nem armazena dados de cartão.
 */
export class MercadoPagoProvider implements PaymentProvider {
  readonly name = 'mercadopago';

  constructor(
    private readonly accessToken: string | undefined,
    private readonly webhookSecret: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get configured(): boolean {
    return Boolean(this.accessToken && this.webhookSecret);
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout> {
    const excluded =
      input.method === 'PIX'
        ? [{ id: 'credit_card' }, { id: 'debit_card' }, { id: 'ticket' }, { id: 'atm' }, { id: 'prepaid_card' }]
        : [{ id: 'bank_transfer' }, { id: 'ticket' }, { id: 'atm' }];
    const body = {
      external_reference: input.externalReference,
      items: input.items.map((item, index) => ({
        id: String(index + 1),
        title: item.title.slice(0, 250),
        quantity: item.quantity,
        unit_price: toAmount(item.unitPrice),
        currency_id: input.currency,
      })),
      payer: {
        name: input.payer.name,
        ...(input.payer.email ? { email: input.payer.email } : {}),
      },
      payment_methods: { excluded_payment_types: excluded, installments: input.method === 'CARD' ? 12 : 1 },
      back_urls: { success: input.returnUrl, pending: input.returnUrl, failure: input.returnUrl },
      auto_return: 'approved',
      notification_url: input.notificationUrl,
      metadata: { order_number: input.orderNumber },
      ...(input.expiresAt
        ? { expires: true, expiration_date_to: input.expiresAt.toISOString(), date_of_expiration: input.expiresAt.toISOString() }
        : {}),
    };
    const response = await this.fetchImpl(`${API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.requireToken()}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': input.externalReference,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new AppError('BAD_GATEWAY', `Mercado Pago respondeu ${response.status} ao criar a preferência`);
    }
    const data = (await response.json()) as { id: string; init_point: string };
    return { checkoutId: data.id, checkoutUrl: data.init_point };
  }

  parseWebhook(request: WebhookRequest): ParsedWebhook {
    const body = (request.body ?? {}) as { id?: string | number; type?: string; action?: string; data?: { id?: string | number } };
    const dataId = request.query['data.id'] ?? (body.data?.id != null ? String(body.data.id) : undefined);
    const valid = verifyMercadoPagoSignature({
      secret: this.webhookSecret ?? '',
      signatureHeader: request.headers['x-signature'],
      requestId: request.headers['x-request-id'],
      dataId,
    });
    if (!this.webhookSecret || !valid) throw unauthenticated('Assinatura do webhook inválida');

    const type = body.type ?? request.query.type ?? request.query.topic ?? 'unknown';
    const eventKey = body.id != null ? `notification:${body.id}` : `${type}:${dataId}:${request.headers['x-request-id'] ?? ''}`;
    return { eventKey, type: body.action ?? type, externalPaymentId: type === 'payment' && dataId ? dataId : null };
  }

  async fetchPayment(externalId: string): Promise<ProviderPayment> {
    const response = await this.fetchImpl(`${API}/v1/payments/${encodeURIComponent(externalId)}`, {
      headers: { Authorization: `Bearer ${this.requireToken()}` },
    });
    if (!response.ok) throw new AppError('BAD_GATEWAY', `Mercado Pago respondeu ${response.status} ao consultar o pagamento`);
    const data = (await response.json()) as {
      id: number | string;
      status: string;
      external_reference: string | null;
      transaction_amount: number;
      date_approved: string | null;
    };
    return {
      externalId: String(data.id),
      externalReference: data.external_reference ?? '',
      status: mapMercadoPagoStatus(data.status),
      rawStatus: data.status,
      amount: cents(Math.round(data.transaction_amount * 100)),
      approvedAt: data.date_approved ? new Date(data.date_approved) : null,
    };
  }

  private requireToken(): string {
    if (!this.accessToken) throw new AppError('SERVICE_UNAVAILABLE', 'Mercado Pago não configurado');
    return this.accessToken;
  }
}
