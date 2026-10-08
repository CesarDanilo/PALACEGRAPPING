// Papéis de um usuário dentro de uma loja (tenant) e o que cada um pode fazer.
// Um usuário pode pertencer a várias lojas com papéis diferentes.

export const ROLES = ['OWNER', 'ADMIN', 'OPERATOR'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'catalog:read', // produtos, categorias, catálogos, links (leitura)
  'catalog:write', // criar/editar produtos, variantes, imagens, categorias, catálogos, links
  'inventory:write', // movimentações manuais de estoque
  'orders:read',
  'orders:write', // mudar status, envio, cancelar
  'customers:read',
  'finance:read',
  'finance:write',
  'settings:write', // configurações comerciais da loja
  'members:manage', // convidar/remover membros e alterar papéis
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const operator: Permission[] = ['catalog:read', 'inventory:write', 'orders:read', 'orders:write', 'customers:read'];
const admin: Permission[] = [...operator, 'catalog:write', 'finance:read', 'finance:write', 'settings:write'];
const owner: Permission[] = [...admin, 'members:manage'];

const grants: Record<Role, ReadonlySet<Permission>> = {
  OPERATOR: new Set(operator),
  ADMIN: new Set(admin),
  OWNER: new Set(owner),
};

export function can(role: Role, permission: Permission): boolean {
  return grants[role].has(permission);
}

export function permissionsOf(role: Role): Permission[] {
  return [...grants[role]];
}

/** Quem pode atribuir um papel: só OWNER atribui OWNER/ADMIN; ninguém rebaixa o último OWNER (regra no caso de uso). */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (actor !== 'OWNER') return false;
  return ROLES.includes(target);
}
