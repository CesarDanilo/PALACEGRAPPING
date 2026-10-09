import { chromium } from '@playwright/test';
const [,, outDir, ...paths] = process.argv;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => m.type() === 'error' && !m.text().includes('401') && errors.push(m.text()));
await p.goto('http://localhost:5190/admin/login');
await p.getByLabel('E-mail').fill('admin@example.com'); await p.getByLabel('Senha').fill('palace-dev-12345');
await p.getByRole('button', { name: 'Entrar' }).click(); await p.getByRole('heading', { name: 'Painel', exact: true }).waitFor();
for (const path of paths) {
  await p.goto('http://localhost:5190/' + path, { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
  const name = path.replace(/\W+/g, '_');
  await p.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log(path, (await p.locator('h1').first().textContent()));
}
console.log(JSON.stringify(errors)); await b.close();
