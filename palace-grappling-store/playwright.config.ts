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
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npx vite --port 5190 --strictPort', url: 'http://localhost:5190', reuseExistingServer: true, timeout: 60_000 },
});
