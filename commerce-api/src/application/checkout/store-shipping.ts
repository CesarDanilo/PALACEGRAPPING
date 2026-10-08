import { shippingFor } from '../../domain/pricing/pricing.js';
import type { UnitOfWork } from '../ports/repositories.js';
import type { ShippingCalculator, ShippingQuote, ShippingQuoteInput } from '../ports/services.js';

/**
 * Frete pela regra configurada na loja (valor fixo, grátis acima de um subtotal
 * ou sempre grátis). Não consulta transportadoras: uma integração futura
 * implementa a mesma porta ShippingCalculator.
 */
export class StoreRuleShippingCalculator implements ShippingCalculator {
  constructor(private readonly uow: UnitOfWork) {}

  async quote(input: ShippingQuoteInput): Promise<ShippingQuote> {
    const settings = await this.uow.repos.tenants.getSettings(input.tenantId);
    const rule =
      settings.shippingMode === 'FREE'
        ? ({ mode: 'FREE' } as const)
        : ({ mode: 'FLAT_RATE', flatRate: settings.shippingFlatRate, freeShippingThreshold: settings.freeShippingThreshold } as const);
    return { amount: shippingFor(rule, input.subtotal), service: settings.shippingMode === 'FREE' ? 'free' : 'flat-rate', estimatedDays: null };
  }
}
