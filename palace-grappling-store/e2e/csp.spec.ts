import { expect, test } from '@playwright/test';

// Roda contra o build de produção servido pelo `vite preview`, que envia a mesma
// CSP da Vercel/Nginx (security-headers.ts). O servidor de desenvolvimento não usa CSP.
//   npm run build && npx vite preview --port 4190
//   E2E_BASE_URL=http://localhost:4190 E2E_CSP=1 npx playwright test --project=csp
test.skip(!process.env.E2E_CSP, 'Defina E2E_CSP=1 e aponte E2E_BASE_URL para o vite preview.');

const routes = ['/', '/loja', '/categoria/kimonos', `/produto/${process.env.E2E_PRODUCT_SLUG ?? 'shorts-fight-day'}`, '/carrinho', '/checkout', '/admin/login'];

test('build de produção sem violações de CSP', async ({ page }) => {
  const violations: string[] = [];
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp ??= [];
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });

  for (const route of routes) {
    const res = await page.goto(route);
    expect(res?.headers()['content-security-policy'], `${route}: cabeçalho CSP`).toContain("script-src 'self'");
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#root > *').first()).toBeVisible();
    violations.push(...(await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])).map((v) => `${route}: ${v}`));
  }
  expect(violations).toEqual([]);
  expect(errors.filter((e) => /Content Security Policy|Refused to/i.test(e))).toEqual([]);
});
