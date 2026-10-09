// Cabeçalhos de segurança da loja. Fonte única: `vercel.json` e `nginx.conf`
// repetem estes valores e o teste `tests/security-headers.test.ts` acusa diferença.
//
// CSP:
// - scripts, estilos e fontes só da própria origem (o build do Vite não gera
//   script nem <style> inline; estilos via atributo `style` do React usam CSSOM,
//   que a CSP não bloqueia);
// - imagens da própria origem e de qualquer HTTPS (fotos do Supabase Storage e
//   capas de catálogo por URL);
// - a API é chamada na mesma origem (`/api`, reescrito pela Vercel/Nginx). Se a
//   loja usar VITE_API_URL em outra origem, inclua essa origem em connect-src;
// - o pagamento é um redirecionamento para o Mercado Pago (navegação), não um iframe.
export const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

export const securityHeaders: Record<string, string> = {
  'Content-Security-Policy': contentSecurityPolicy,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};
