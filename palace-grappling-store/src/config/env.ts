// Variáveis públicas do frontend (embutidas no build). Nunca coloque segredos aqui:
// tudo que começa com VITE_ fica visível no navegador.

export const config = {
  apiUrl: (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, ''),
  storeSlug: import.meta.env.VITE_STORE_SLUG || 'palace-grappling',
} as const;
