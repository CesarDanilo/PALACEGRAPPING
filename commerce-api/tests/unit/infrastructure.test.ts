import { describe, expect, it } from 'vitest';
import { sniffImageType } from '../../src/application/products/product.service.js';
import { loadEnv } from '../../src/config/env.js';
import { mapMercadoPagoStatus, MercadoPagoProvider, verifyMercadoPagoSignature } from '../../src/infrastructure/payments/mercadopago.provider.js';
import { hmacSha256Hex } from '../../src/shared/crypto.js';

describe('assinatura de webhook do Mercado Pago', () => {
  const secret = 'segredo-de-teste';
  const sign = (manifest: string) => hmacSha256Hex(secret, manifest);

  it('aceita assinatura válida (data.id alfanumérico em minúsculas)', () => {
    const v1 = sign('id:abc123;request-id:req-1;ts:1704908010;');
    expect(verifyMercadoPagoSignature({ secret, signatureHeader: `ts=1704908010,v1=${v1}`, requestId: 'req-1', dataId: 'ABC123' })).toBe(true);
  });

  it('rejeita assinatura adulterada, ausente ou de outro pagamento', () => {
    const v1 = sign('id:123;request-id:req-1;ts:1704908010;');
    expect(verifyMercadoPagoSignature({ secret, signatureHeader: `ts=1704908010,v1=${v1}`, requestId: 'req-1', dataId: '124' })).toBe(false);
    expect(verifyMercadoPagoSignature({ secret, signatureHeader: undefined, requestId: 'req-1', dataId: '123' })).toBe(false);
    expect(verifyMercadoPagoSignature({ secret: 'outro', signatureHeader: `ts=1704908010,v1=${v1}`, requestId: 'req-1', dataId: '123' })).toBe(false);
  });

  it('o provedor recusa webhooks sem assinatura válida', () => {
    const provider = new MercadoPagoProvider('token', secret, (() => Promise.reject(new Error('sem rede'))) as typeof fetch);
    expect(() => provider.parseWebhook({ headers: {}, query: { 'data.id': '1', type: 'payment' }, body: {} })).toThrow(/Assinatura/);
    const v1 = sign('id:1;request-id:r;ts:10;');
    const parsed = provider.parseWebhook({ headers: { 'x-signature': `ts=10,v1=${v1}`, 'x-request-id': 'r' }, query: { 'data.id': '1', type: 'payment' }, body: { id: 99, type: 'payment', action: 'payment.updated', data: { id: '1' } } });
    expect(parsed).toEqual({ eventKey: 'notification:99', type: 'payment.updated', externalPaymentId: '1' });
  });

  it('mapeia os status do provedor', () => {
    expect(mapMercadoPagoStatus('approved')).toBe('APPROVED');
    expect(mapMercadoPagoStatus('in_process')).toBe('PENDING');
    expect(mapMercadoPagoStatus('charged_back')).toBe('REFUNDED');
    expect(mapMercadoPagoStatus('cancelled')).toBe('CANCELLED');
  });

  it('não se declara configurado sem token e segredo', () => {
    expect(new MercadoPagoProvider(undefined, undefined).configured).toBe(false);
    expect(new MercadoPagoProvider('token', undefined).configured).toBe(false);
  });
});

describe('detecção de tipo de imagem', () => {
  it('confere a assinatura binária', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffImageType(png)).toBe('image/png');
    expect(sniffImageType(jpeg)).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
  });
});

describe('variáveis de ambiente', () => {
  const base = { DATABASE_URL: 'postgresql://x', JWT_ACCESS_SECRET: 'x'.repeat(40) };
  it('exige segredos fortes e cookies seguros em produção', () => {
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'curto' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(/COOKIE_SECURE/);
    expect(loadEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
  });
});
