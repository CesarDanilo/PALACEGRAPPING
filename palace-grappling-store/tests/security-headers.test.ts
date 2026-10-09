import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from '../security-headers';

// Garante que Vercel, Nginx e o preview do Vite servem a mesma política.
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
const nginx = readFileSync('nginx.conf', 'utf8');

describe('cabeçalhos de segurança', () => {
  it('vercel.json aplica todos os cabeçalhos em todas as rotas', () => {
    const all = vercel.headers.find((h) => h.source === '/(.*)')!.headers;
    for (const [key, value] of Object.entries(securityHeaders)) expect(all).toContainEqual({ key, value });
  });

  it('nginx.conf aplica a mesma CSP na rota do index.html', () => {
    const spa = nginx.slice(nginx.indexOf('location / {'));
    expect(spa).toContain(`add_header Content-Security-Policy "${contentSecurityPolicy}" always;`);
    for (const key of Object.keys(securityHeaders)) expect(spa).toContain(`add_header ${key}`);
  });

  it('a CSP não libera scripts inline nem eval', () => {
    expect(contentSecurityPolicy).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy).toContain("object-src 'none'");
  });
});
