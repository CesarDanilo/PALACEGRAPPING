// Validade de um link exclusivo de catálogo. O token dá acesso somente à vitrine
// do catálogo associado; nunca autoriza operações administrativas.

export interface LinkState {
  isActive: boolean;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
  catalog: CatalogWindow;
}

export interface CatalogWindow {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export type LinkUnavailableReason = 'INACTIVE' | 'EXPIRED' | 'USAGE_LIMIT' | 'CATALOG_UNAVAILABLE';

export function catalogIsOpen(catalog: CatalogWindow, now: Date): boolean {
  if (!catalog.isActive) return false;
  if (catalog.startsAt && catalog.startsAt > now) return false;
  if (catalog.endsAt && catalog.endsAt <= now) return false;
  return true;
}

export function linkUnavailableReason(link: LinkState, now: Date): LinkUnavailableReason | null {
  if (!link.isActive) return 'INACTIVE';
  if (link.expiresAt && link.expiresAt <= now) return 'EXPIRED';
  if (link.maxUses != null && link.useCount >= link.maxUses) return 'USAGE_LIMIT';
  if (!catalogIsOpen(link.catalog, now)) return 'CATALOG_UNAVAILABLE';
  return null;
}
