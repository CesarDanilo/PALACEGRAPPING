/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { securityHeaders } from './security-headers';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5190,
      strictPort: true,
      // Em desenvolvimento a loja e a API ficam na mesma origem (cookies de sessão SameSite=Lax).
      proxy: { '/api': { target: env.DEV_API_PROXY_TARGET || 'http://localhost:3350', changeOrigin: true } },
    },
    // O preview serve o build com os mesmos cabeçalhos de produção (inclusive CSP).
    // O servidor de desenvolvimento não usa CSP: o HMR do Vite injeta scripts inline.
    preview: { port: 5190, headers: securityHeaders },
    test: {
      environment: 'jsdom',
      setupFiles: ['tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
      css: false,
    },
  };
});
