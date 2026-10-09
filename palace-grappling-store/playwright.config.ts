import { defineConfig, devices } from '@playwright/test';

// E2E contra a loja e a API reais (com banco e seed de desenvolvimento).
// Pré-requisitos: API em http://localhost:3350 com `npm run db:seed` e
// SEED_ADMIN_PASSWORD igual a E2E_ADMIN_PASSWORD. A loja é iniciada aqui.
export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5190', trace: 'retain-on-failure' },
  projects: [
    // Fluxo de compra e painel em um desktop e um celular emulados.
    { name: 'desktop', testMatch: /store.spec/, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', testMatch: /store.spec/, use: { ...devices['Pixel 7'] } },
    // 320, 390, 768 e 1280 px: cada teste define a própria viewport.
    { name: 'responsive', testMatch: /responsive.spec/, use: { ...devices['Desktop Chrome'] } },
    // Só com E2E_CSP=1, contra o build (vite preview).
    { name: 'csp', testMatch: /csp.spec/, use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npx vite --port 5190 --strictPort', url: 'http://localhost:5190', reuseExistingServer: true, timeout: 60_000 },
});
