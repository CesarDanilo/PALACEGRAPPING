# Relatório do adendo: UX/UI, mobile-first, segurança e testes

Data: 2026-10-09. Repositórios: `CesarDanilo/PALACEGRAPPING` (loja, commit `030b8e6`) e `CesarDanilo/palace-commerce-api` (API, commits `757c51b` e `8180401`).

Este relatório separa o que foi **corrigido**, o que foi **testado automaticamente** (com resultado real) e o que **não foi testado**. O build passar não torna o sistema seguro nem pronto para produção: a seção 11 lista o que falta.

---

## 1. Problemas encontrados

A auditoria completa, feita antes das correções, está em [`docs/AUDITORIA.md`](AUDITORIA.md). Resumo:

| # | Gravidade | Problema | Tipo |
| --- | --- | --- | --- |
| 1 | Alta | Sem troca de senha (admin preso à senha do seed) | Não implementado |
| 2 | Alta | Rolagem horizontal a 320 px: cabeçalho da loja (341 px), banner de categoria (556 px), página de produto, tabela de variantes do painel (1043 px) | Confirmado |
| 3 | Alta | Painel sem menu móvel (menu fixo empilhado no topo) | Confirmado |
| 4 | Alta | 4 vulnerabilidades altas em dependências da API (`npm audit`) | Confirmado |
| 5 | Alta | Rate limit só em login/refresh/checkout, sem configuração por variável e só em memória | Confirmado |
| 6 | Alta | Uploads sem remoção de EXIF/GPS, sem reprocessamento e sem limite de fotos | Confirmado |
| 7 | Média | Propriedades extras no JSON eram descartadas em silêncio (não recusadas) | Confirmado |
| 8 | Média | Rotas com cookie (`/auth/refresh`, `/auth/logout`) sem verificação de `Origin` | Risco |
| 9 | Média | Telefone sem DDD válido, UF livre, nome sem sobrenome, SKU sem padrão, sem limite de unidades | Confirmado |
| 10 | Média | Formulários do painel sem Zod (só HTML e API) | Confirmado |
| 11 | Média | Hero e "Sobre" em PNG de ~740 KB; imagem principal sem `fetchpriority` | Confirmado |
| 12 | Média | Loja sem CSP; no Nginx, os cabeçalhos de segurança nem chegavam ao `index.html` (um `add_header` no `location` anula os do `server`) | Confirmado |
| 13 | Baixa | 11 a 26 alvos de toque menores que 24 px por página | Confirmado |
| 14 | Baixa | Webhook do Mercado Pago sem janela de tempo contra replay | Risco |
| 15 | Baixa | Consulta pública de pedido só com o limite geral | Risco |
| 16 | Baixa | Zod 4 tenta `new Function` (JIT): com a CSP nova, gerava violação de `eval` no checkout e no painel | Encontrado pelo teste de CSP |

## 2. Correções aplicadas

- **Mobile:** cabeçalho da loja cabe em 320 px ("Meus pedidos" vai para o menu abaixo de 400 px); banner, página de produto e colunas do painel com largura mínima zero; botão "Adicionar ao carrinho" quebra linha. Resultado medido: nenhuma rolagem horizontal em 320, 390, 768 e 1280 px nas 13 rotas testadas.
- **Painel:** menu em gaveta abaixo de 1024 px. Abre pelo botão, fecha ao navegar, ao tocar fora e com Esc (devolvendo o foco ao botão), trava a rolagem do fundo e respeita `prefers-reduced-motion`.
- **Variantes no cadastro:** viraram cartões no celular e linha única a partir de 900 px, dentro do mesmo formulário com validação.
- **Formulários:** React Hook Form + Zod em produto e variantes, nova variante, categoria, movimentação de estoque, catálogo, link exclusivo, receita/despesa, configurações, troca de senha e checkout. Cada erro aparece no campo, com `aria-invalid`.
- **Troca de senha:** endpoint `POST /auth/password` e painel em Configurações.
- **Imagens:** fotos editoriais em WebP com até 1800 px (2,9 MB → 664 KB; hero de 725 KB → 37 KB). `fetchpriority="high"` na imagem principal e no banner.
- **Alvos de toque:** links de tabela, "Ver tudo", "Role", estados vazios, checkboxes e botões do painel com pelo menos 24 px (a maioria 44 px).
- **Backend:** validação estrita, rate limit por grupo com Redis opcional, CSRF por `Origin`, uploads reprocessados, dependências atualizadas (detalhes nas seções 4 a 6).
- **CSP e cabeçalhos** na Vercel, no Nginx e no `vite preview`, com Zod em modo jitless.

## 3. Arquivos alterados

**API (`commerce-api`)**
- Novos: `src/shared/validation.ts`, `src/presentation/http/rate-limits.ts`, `src/infrastructure/rate-limit/redis-store.ts`, `src/infrastructure/images/sharp-image-processor.ts`, `tests/integration/security.test.ts`, `tests/unit/validation.test.ts`.
- Alterados: `src/config/env.ts`, `src/container.ts`, `src/presentation/http/{app,middlewares,route-kit}.ts`, todas as rotas em `src/presentation/http/routes/`, `src/application/auth/auth.service.ts`, `src/application/products/product.service.ts`, `src/application/ports/{repositories,services}.ts`, `src/infrastructure/prisma/identity.repositories.ts`, `src/infrastructure/payments/mercadopago.provider.ts`, `package.json` (sharp, redis, rate-limit-redis, overrides), testes existentes, `.env.example`, `render.yaml`, `README.md`.

**Loja (`palace-grappling-store`)**
- Novos: `src/lib/validation.ts`, `src/lib/zod.ts`, `security-headers.ts`, `scripts/check-bundle.mjs`, `e2e/responsive.spec.ts`, `e2e/csp.spec.ts`, `tests/validation.test.ts`, `tests/security-headers.test.ts`, `public/media/*.webp`.
- Alterados: `src/layouts/{AdminLayout,StoreLayout}.tsx` e CSS, `src/pages/admin/{ProductsPages,CatalogAdminPages,OperationsPages,LoginPage}.tsx`, `admin.module.css`, `src/features/checkout/checkout-schema.ts`, `src/pages/store/{product,home}.module.css`, `src/components/store/{Cover.tsx,cover.module.css,store.module.css}`, `src/components/media/Media.tsx`, `src/components/ui/ui.module.css`, `src/content/media.ts`, `vercel.json`, `nginx.conf`, `vite.config.ts`, `playwright.config.ts`, `eslint.config.js`, `tsconfig.json`, `package.json`, `README.md`.
- Removidos: PNG/JPG antigos de `public/media/`.

**Documentação:** `docs/AUDITORIA.md` e este relatório.

## 4. Medidas de segurança implementadas

- **Validação independente na API** (Zod estrito, recusa o que não está previsto). A validação do navegador é só conveniência.
- **Mass assignment:** campos como `tenantId`, `total`, `subtotal`, `unitPrice` e `deletedAt` enviados pelo cliente geram 400 (antes eram ignorados).
- **Limites de payload:** JSON até 200 KB (413), até 100 unidades por pedido, listas e textos com tamanho máximo.
- **CSRF:** `/auth/refresh`, `/auth/logout` e `/auth/password` exigem `Origin` (ou `Referer`) da lista `CORS_ORIGINS`. As demais rotas usam `Authorization: Bearer`, que o navegador não envia sozinho.
- **Sessão:** troca de senha exige a senha atual e revoga todas as sessões. Já existiam: refresh token rotativo em cookie `HttpOnly` com detecção de reuso e Argon2id.
- **Uploads:** tipo conferido pelo conteúdo; imagem decodificada pelo `sharp` (arquivo corrompido ou disfarçado → 415), sem EXIF/GPS, redimensionada (lado maior 2000 px, entrada até 40 MP) e regravada em WebP; nome aleatório `<tenant>/products/<produto>/<uuid>.webp` (o nome enviado nunca é usado); limite de fotos por produto; só membros da loja dona do produto.
- **Webhook:** assinatura HMAC (já existia) e janela de tempo configurável contra replay; idempotência por evento.
- **Erros:** formato único, sem stack, SQL ou caminhos internos.
- **Dependências:** `npm audit` com 0 vulnerabilidades nos dois projetos.
- **Navegador:** CSP sem `unsafe-inline` nem `eval`, `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`. As três configurações (Vercel, Nginx, preview) são conferidas por teste.
- **Segredos:** nada secreto no bundle (varredura automática); `.env` fora do Git nos dois repositórios.

## 5. Validações adicionadas

| Campo | Regra (API e navegador) |
| --- | --- |
| Nome do comprador | nome e sobrenome, 3 a 120 caracteres, sem `<` `>` |
| Telefone | DDD válido (lista Anatel) + 8 dígitos (fixo, começa com 2 a 5) ou 9 (celular, começa com 9); aceita +55 |
| E-mail | formato válido, até 254 caracteres |
| CEP | 8 dígitos |
| UF | uma das 27 siglas |
| Endereço | rua até 160, número até 20, complemento até 80, bairro e cidade até 80 |
| Senha | 12 a 128 caracteres, com letras e números; confirmação igual; diferente da atual |
| SKU | 1 a 64 caracteres: letras, números, `.`, `-`, `_`; sem repetição no mesmo cadastro |
| Preço e promoção | inteiro em centavos, de 0 a 999.999.999.999; promoção menor que o preço |
| Estoque | inteiro de 0 a 1.000.000; movimentação de 1 a 100.000 |
| Quantidade no pedido | inteira e positiva; até 100 unidades por pedido |
| Tamanho e cor | até 20 e 40 caracteres; cor em hexadecimal `#RRGGBB` |
| IDs na URL | UUID (outro formato → 400 antes de consultar o banco) |
| Catálogo | nome 2 a 120, slug em minúsculas e hífens, capa só em http(s), fim depois do início, até 500 produtos |
| Link exclusivo | catálogo obrigatório, data de expiração futura, limite de pedidos de 1 a 1.000.000 |
| Configurações | prazo de pagamento de 10 a 10.080 min, alerta de estoque de 0 a 1.000, prefixo até 8 caracteres |
| Números em geral | NaN, infinito, negativo e fração recusados |
| Arquivos | tamanho (`UPLOAD_MAX_BYTES`), tipo pelo conteúdo, imagem decodificável, limite por produto |

## 6. Políticas de rate limit

Por IP, com resposta 429, `Retry-After` e cabeçalhos `RateLimit`. Todos os valores mudam por variável de ambiente.

| Grupo | Rotas | Padrão | Variável |
| --- | --- | --- | --- |
| Geral | toda a API | 600/min | `RATE_LIMIT_API_PER_MIN` |
| Login | `POST /auth/login` (conta acertos e erros) | 10/15 min | `LOGIN_RATE_LIMIT` |
| Sessão | `/auth/refresh` | 300/15 min | `RATE_LIMIT_REFRESH_PER_15MIN` |
| Senha | `/auth/password` | 5/15 min | `RATE_LIMIT_PASSWORD_PER_15MIN` |
| Vitrine | `/public/*` | 300/min | `RATE_LIMIT_PUBLIC_PER_MIN` |
| Consulta de pedido | `/public/orders/*` | 30/min | `RATE_LIMIT_ORDER_LOOKUP_PER_MIN` |
| Checkout | `/checkout/*`, `/payments/*` | 30/min | `RATE_LIMIT_CHECKOUT_PER_MIN` |
| Upload | `POST /products/:id/images` | 60/15 min | `RATE_LIMIT_UPLOAD_PER_15MIN` |
| Links de catálogo | `POST /catalog-links` | 60/h | `RATE_LIMIT_LINKS_PER_HOUR` |
| Administração sensível | escritas em `/finance`, `/settings`, `/tenants/current/members` | 120/min | `RATE_LIMIT_ADMIN_SENSITIVE_PER_MIN` |

**Armazenamento:** sem `REDIS_URL`, os contadores ficam em memória, valem para uma única instância e zeram a cada deploy. Isso **não** é proteção distribuída. Com `REDIS_URL`, todas as instâncias compartilham os contadores.

**IP real:** a API só lê `X-Forwarded-For` até `TRUST_PROXY_HOPS` proxies (2 no Render atrás da Vercel). Sem proxy configurado, o cabeçalho enviado pelo cliente é ignorado. Isso está testado.

## 7. Testes executados (resultados reais)

| Suíte | Comando | Resultado |
| --- | --- | --- |
| API: typecheck e lint | `npx tsc --noEmit -p . && npx eslint .` | sem erros |
| API: unitários + integração (PostgreSQL real no Docker) | `npx vitest run` | **85 de 85 passaram** (7 arquivos) |
| API: imagem Docker | `docker build` + `sharp` dentro do container | build ok; `sharp` gera WebP |
| API: dependências | `npm audit` | 0 vulnerabilidades |
| Loja: typecheck, lint e build | `npm run build && npx eslint .` | sem erros |
| Loja: Vitest | `npm test` | **36 de 36 passaram** (5 arquivos) |
| Loja: Playwright | `npm run test:e2e` | **18 de 18 passaram** |
| Loja: CSP no build | projeto `csp` contra `vite preview` | **passou**: 0 violações em 7 rotas (a primeira execução achou o `eval` do Zod, corrigido) |
| Loja: segredos no bundle | `npm run check:bundle` | nada encontrado; o script foi conferido com um arquivo plantado com chave falsa (detectou e saiu com erro) |
| Loja: dependências | `npm audit` | 0 vulnerabilidades |

**O que os testes de segurança da API cobrem** (`tests/integration/security.test.ts` e os já existentes):
- **Payloads:** propriedades extras (mass assignment), JSON malformado sem detalhes internos, número como texto, negativo e fracionário, corpo acima do limite (413), telefone com DDD inválido, celular sem 9, nome sem sobrenome, UF e CEP inválidos, mais de 100 unidades, UUID inválido e tentativa de SQL na URL.
- **Sessão:** CSRF por `Origin` e por `Referer` de outro site; troca de senha (senha atual errada, confirmação diferente, senha fraca, sucesso revogando o cookie antigo, login com a senha nova).
- **Uploads:** EXIF removido e saída em WebP, nome com `../` ignorado, JPEG corrompido e HTML disfarçado recusados (415), limite de fotos (409), envio para produto de outra loja (404).
- **Rate limit:** 429 com `Retry-After` no login mesmo com a senha certa, política do checkout independente da vitrine, `X-Forwarded-For` forjado sem efeito.
- **Isolamento:** entre lojas e entre papéis.
- **Estoque:** compras concorrentes nunca vendem além do estoque.
- **Pedidos e pagamentos:** idempotência, webhook com assinatura inválida e janela contra replay.

**Playwright** (loja e API reais, banco local com seed):
- Compra completa em desktop e Pixel 7.
- Nas larguras 320, 390, 768 e 1280 px: Home, Loja, Categoria, Produto, Carrinho e Checkout; no painel, login, Painel, Cadastro de produto, Estoque, Pedidos, Financeiro e Configurações. Em todas, sem rolagem horizontal e com todos os campos rotulados.
- Menu do painel: abre, fecha ao navegar e com Esc, e devolve o foco.
- Mensagens de validação no checkout (sem enviar a requisição), no cadastro de produto e na troca de senha.
- Teclado: link "Pular para o conteúdo" e foco visível.

## 8. Testes bloqueados ou não executados

| Teste | Situação | Motivo |
| --- | --- | --- |
| Pagamento real no Mercado Pago (sandbox) | **Bloqueado** | Sem credenciais de teste do Mercado Pago. Os testes usam um provedor falso; a assinatura HMAC é testada com segredo de teste |
| Rate limit distribuído com Redis | **Não executado** | Não há Redis disponível. O código do store Redis compila e é ligado por `REDIS_URL`, mas não foi testado contra um Redis real |
| Upload real no Supabase Storage e políticas do bucket | **Não executado nesta etapa** | Os testes usam storage em memória; as políticas do bucket não foram verificadas automaticamente |
| Aparelhos físicos (iOS Safari, Android) | **Não executado** | Só emulação de viewport no Chromium; Safari/WebKit não foi rodado |
| Cabeçalhos na URL publicada (Vercel/Render) | **Não verificado** | Testado no `vite preview` e por comparação de arquivos; falta conferir com `curl -I` depois do deploy |
| Teste de invasão (pentest) | **Não realizado** | Foram feitos testes automatizados de segurança da API, não um teste de invasão |
| Carga e estresse | **Não realizado** | — |
| Auditoria de acessibilidade completa (leitor de tela, contraste por ferramenta) | **Parcial** | Cobertos rótulos, foco, teclado e áreas de toque; sem leitor de tela nem axe |

## 9. Como reproduzir

```bash
# API
cd commerce-api
docker compose up -d postgres          # PostgreSQL de teste na porta 5452
npm ci
npx tsc --noEmit -p . && npx eslint .
npx vitest run                          # 85 testes (integração usa TEST_DATABASE_URL)
npm audit

# API local para os testes da loja (banco local com seed)
DATABASE_URL=postgresql://commerce:commerce@localhost:5452/commerce \
DIRECT_URL=postgresql://commerce:commerce@localhost:5452/commerce \
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD=palace-dev-12345 \
  sh -c 'npx prisma migrate deploy && npm run db:seed'
DATABASE_URL=postgresql://commerce:commerce@localhost:5452/commerce LOGIN_RATE_LIMIT=500 \
RATE_LIMIT_CHECKOUT_PER_MIN=500 SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= npm run dev

# Loja (em outro terminal)
cd palace-grappling-store
npm ci
npm run build && npx eslint . && npm test
npm run check:bundle
npm run test:e2e                        # sobe o Vite sozinho na porta 5190
npx vite preview --port 4190 &
E2E_BASE_URL=http://localhost:4190 E2E_CSP=1 npx playwright test --project=csp
```

## 10. Riscos restantes

- **Rate limit em memória no Render:** vale enquanto houver uma única instância. Com escala horizontal sem Redis, cada instância conta separado e os contadores zeram a cada deploy.
- **Credenciais expostas na conversa:** a chave secreta do Supabase e a senha do banco foram enviadas em texto no chat. **Gire as duas** no painel do Supabase e atualize o `.env` local e o Render.
- **Senha antiga do admin de produção:** a senha temporária gerada para o admin no Supabase continua válida até ser trocada. A tela de troca já existe em Configurações.
- **CSP com `img-src https:`:** permite imagens de qualquer HTTPS (por causa das capas de catálogo por URL). Dá para restringir ao domínio do Supabase se as capas passarem a ser enviadas pelo painel.
- **Validação do navegador é cópia:** as regras da loja espelham as da API manualmente (`src/lib/validation.ts` e `commerce-api/src/shared/validation.ts`). Se uma mudar sem a outra, a API continua decidindo, mas a mensagem pode aparecer só depois do envio.
- **Supabase RLS:** está ativo sem políticas. A API usa a `service_role`, que ignora RLS. Qualquer acesso direto ao banco com a chave anônima fica bloqueado, o que é o desejado, mas não há políticas finas.
- **Membros da equipe:** convites e papéis só pela API, sem tela.
- **Textos de política e termos** ainda são modelo e precisam de revisão jurídica.

## 11. Pendências para produção

1. Girar a chave secreta do Supabase e a senha do banco.
2. Trocar a senha do admin de produção (Configurações → Sua senha).
3. Configurar o Mercado Pago (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`) e rodar um pagamento de ponta a ponta no sandbox.
4. Se houver mais de uma instância da API, criar um Redis (Render Key Value) e definir `REDIS_URL`.
5. Depois do deploy, conferir os cabeçalhos com `curl -I` na URL da loja e na da API.
6. Revisar as políticas do bucket `product-images`: leitura pública e nenhuma escrita para `anon` ou `authenticated`.
7. Testar em aparelhos reais (iPhone com Safari e um Android de entrada).
8. Revisar os textos de trocas, privacidade e termos.
9. Considerar um teste de invasão externo antes de volume real de vendas.
