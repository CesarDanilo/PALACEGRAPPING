// Variáveis públicas do frontend (embutidas no build). Nunca coloque segredos aqui:
// tudo que começa com VITE_ fica visível no navegador.

const env = import.meta.env;
const text = (value: string | undefined, fallback: string) => (value?.trim() ? value.trim() : fallback);

const brandName = text(env.VITE_BRAND_NAME, 'Palace Grappling');
const [firstWord = brandName, ...rest] = brandName.split(/\s+/);

/**
 * Identidade da loja. Para vender o sistema para outra loja, troque estas variáveis
 * (na Vercel: Settings → Environment Variables) e gere um novo build:
 *   VITE_BRAND_NAME         nome completo ("Palace Grappling")
 *   VITE_BRAND_SHORT        palavra de destaque do logotipo ("PALACE")
 *   VITE_BRAND_SUBTITLE     linha menor do logotipo ("GRAPPLING")
 *   VITE_BRAND_DESCRIPTION  descrição curta (meta description e textos)
 *   VITE_BRAND_SINCE        ano de fundação ("2026")
 *   VITE_ADMIN_LABEL        rótulo do painel ("ADMIN")
 * Os dados comerciais (contato, frete, prefixo do pedido) ficam em Configurações no painel.
 */
export const brand = {
  name: brandName,
  short: text(env.VITE_BRAND_SHORT, firstWord.toUpperCase()),
  subtitle: text(env.VITE_BRAND_SUBTITLE, rest.join(' ').toUpperCase()),
  description: text(env.VITE_BRAND_DESCRIPTION, `${brandName}: kimonos, rash guards e equipamentos premium para Jiu-Jitsu e grappling.`),
  since: text(env.VITE_BRAND_SINCE, '2026'),
  adminLabel: text(env.VITE_ADMIN_LABEL, 'ADMIN'),
} as const;

export const config = {
  apiUrl: (env.VITE_API_URL ?? '').replace(/\/$/, ''),
  storeSlug: env.VITE_STORE_SLUG || 'palace-grappling',
} as const;
