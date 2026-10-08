// Portas para serviços externos. As implementações ficam em src/infrastructure.
import type { Cents } from '../../shared/money.js';
import type { PaymentMethod, PaymentStatus } from '../../domain/payments/payment-status.js';

export interface Clock {
  now(): Date;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

export interface AccessTokenClaims {
  sub: string;
  email: string;
}

export interface AccessTokenService {
  sign(claims: AccessTokenClaims): Promise<{ token: string; expiresIn: number }>;
  /** Lança AppError UNAUTHENTICATED quando inválido ou expirado. */
  verify(token: string): Promise<AccessTokenClaims>;
}

// ── Armazenamento de arquivos (Supabase Storage) ──

export interface StoredObject {
  path: string;
  publicUrl: string;
}

export interface ObjectStorage {
  readonly configured: boolean;
  upload(path: string, body: Buffer, contentType: string): Promise<StoredObject>;
  remove(paths: string[]): Promise<void>;
}

// ── Frete ──
// A primeira implementação usa a regra configurada na loja (valor fixo / grátis).
// Uma integração com transportadora implementa esta mesma porta.

export interface ShippingQuoteInput {
  tenantId: string;
  subtotal: Cents;
  destinationZipCode: string | null;
  itemCount: number;
}

export interface ShippingQuote {
  amount: Cents;
  service: string;
  estimatedDays: number | null;
}

export interface ShippingCalculator {
  quote(input: ShippingQuoteInput): Promise<ShippingQuote>;
}

// ── Pagamentos ──

export interface CreateCheckoutInput {
  tenantId: string;
  orderId: string;
  orderNumber: string;
  /** Referência única enviada ao provedor; volta nos webhooks. */
  externalReference: string;
  method: PaymentMethod;
  amount: Cents;
  currency: string;
  payer: { name: string; email: string | null; phone: string };
  items: { title: string; quantity: number; unitPrice: Cents }[];
  /** URL de retorno do comprador (não confirma pagamento). */
  returnUrl: string;
  notificationUrl: string;
  expiresAt: Date | null;
}

export interface CreatedCheckout {
  checkoutId: string;
  checkoutUrl: string;
}

/** Estado do pagamento lido do provedor (fonte de verdade). */
export interface ProviderPayment {
  externalId: string;
  externalReference: string;
  status: PaymentStatus;
  rawStatus: string;
  amount: Cents;
  approvedAt: Date | null;
}

export interface WebhookRequest {
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  body: unknown;
}

export interface ParsedWebhook {
  /** Chave de idempotência do evento. */
  eventKey: string;
  type: string;
  /** Id do pagamento no provedor a ser consultado; null quando o evento não é de pagamento. */
  externalPaymentId: string | null;
}

export interface PaymentProvider {
  readonly name: string;
  readonly configured: boolean;
  createCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout>;
  /** Valida a assinatura e extrai o evento. Lança AppError UNAUTHENTICATED se a assinatura for inválida. */
  parseWebhook(request: WebhookRequest): ParsedWebhook;
  fetchPayment(externalId: string): Promise<ProviderPayment>;
}
