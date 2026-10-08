import { can, type Permission, type Role } from '../domain/access/permissions.js';
import { forbidden } from '../shared/errors.js';

/**
 * Contexto de uma operação administrativa. O `tenantId` aqui já foi verificado
 * contra a associação do usuário no banco (middleware requireTenant); nunca vem
 * direto do cliente.
 */
export interface TenantContext {
  tenantId: string;
  userId: string;
  role: Role;
}

export function authorize(ctx: TenantContext, permission: Permission): void {
  if (!can(ctx.role, permission)) throw forbidden(`Seu papel (${ctx.role}) não permite ${permission}`);
}
