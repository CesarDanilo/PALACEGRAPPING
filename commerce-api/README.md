# commerce-api

API comercial **genérica e multi-tenant**: produtos, variantes, estoque, catálogos, links exclusivos, clientes, checkout, pagamentos e financeiro. Nenhuma marca é conhecida pelo código; cada loja é um *tenant* configurado por dados. A primeira instalação atende a loja Palace Grappling, mas nada nesta base depende dela.

> Estado: **fases 1 a 5 concluídas** (API completa, testada e empacotada). Veja [Limitações e roadmap](#limitações-e-roadmap) para o que ainda falta.

## Sumário

- [Tecnologias](#tecnologias)
- [Arquitetura em camadas](#arquitetura-em-camadas)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Multi-tenancy e isolamento](#multi-tenancy-e-isolamento)
- [Instalação e execução](#instalação-e-execução)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Supabase (banco e Storage)](#supabase-banco-e-storage)
- [Migrations e seed](#migrations-e-seed)
- [Endpoints](#endpoints)
- [Autenticação e autorização](#autenticação-e-autorização)
- [Checkout e estoque](#checkout-e-estoque)
- [Pagamentos e webhooks](#pagamentos-e-webhooks)
- [Financeiro](#financeiro)
- [Segurança](#segurança)
- [Testes](#testes)
- [Docker e deploy](#docker-e-deploy)
- [Troubleshooting](#troubleshooting)
- [Decisões técnicas](#decisões-técnicas)
- [Limitações e roadmap](#limitações-e-roadmap)

## Tecnologias

| Item | Versão | Uso |
| --- | --- | --- |
| Node.js | ≥ 22 | runtime |
| TypeScript | 6.0 (strict, `noUncheckedIndexedAccess`) | tipagem |
| Express | 5.2 | HTTP |
| Prisma ORM | 7.10 (`prisma-client` + `@prisma/adapter-pg`) | acesso a dados e migrations |
| PostgreSQL | Supabase (produção), 17 local (dev/testes) | banco |
| Zod | 4.6 | validação de entrada e geração do OpenAPI |
| @node-rs/argon2 | 2.2 | hash de senha (Argon2id) |
| jose | 6.2 | JWT de acesso |
| Supabase JS | 2.117 | Storage de imagens |
| Vitest + Supertest | 5.0 / 7.3 | testes |
| pino | 10 | logs estruturados |

Prisma 7 usa *driver adapters*: o cliente gerado fica em `src/generated/prisma` (ignorado no git, gerado por `npm run db:generate`, `build` e `typecheck`). Não há mistura com APIs do Prisma 5/6.

## Arquitetura em camadas

```
presentation  →  application  →  domain
      ↓               ↓
infrastructure (implementa as portas da application)
```

| Camada | Responsabilidade | Não pode |
| --- | --- | --- |
| `domain/` | Regras puras: papéis e permissões, máquina de estados do pedido e do pagamento, cálculo de preço/frete, validade de links, regras de produto. | Importar Express, Prisma ou qualquer I/O. |
| `application/` | Casos de uso (serviços), orquestração de transações, autorização por permissão, **portas** (`ports/repositories.ts`, `ports/services.ts`). | Conhecer HTTP ou Prisma. |
| `infrastructure/` | Repositórios Prisma, unidade de trabalho transacional, Argon2/JWT, Supabase Storage, Mercado Pago. | Conter regra comercial. |
| `presentation/` | Rotas, validação Zod de body/query/params, middlewares (auth, tenant, loja, rate limit, erros), serialização e OpenAPI. | Acessar Prisma ou decidir regra comercial. |
| `config/`, `shared/` | Variáveis de ambiente validadas, logger, erros padronizados, dinheiro em centavos, utilitários de criptografia e paginação. | — |

`src/container.ts` é a raiz de composição: o único arquivo que conhece as implementações concretas. A injeção de dependência é manual (construtores), sem framework.

## Estrutura de pastas

```
commerce-api/
├── prisma/
│   ├── schema.prisma          # modelo de dados (todas as tabelas comerciais têm tenantId)
│   ├── migrations/            # migrations versionadas (inclui CHECKs de estoque/preço)
│   └── seed.ts                # dados de desenvolvimento (recusa NODE_ENV=production)
├── src/
│   ├── domain/                # access, catalog, orders, payments, pricing, products
│   ├── application/           # auth, tenants, products, inventory, catalogs, storefront,
│   │   │                      # checkout, orders, payments, finance, customers, dashboard
│   │   └── ports/             # interfaces de repositórios e serviços externos
│   ├── infrastructure/
│   │   ├── prisma/            # client, mappers, repositórios, unit-of-work
│   │   ├── payments/          # mercadopago.provider.ts
│   │   ├── security/          # Argon2, JWT, relógio
│   │   └── storage/           # supabase-storage.ts
│   ├── presentation/http/     # app, middlewares, route-kit, serializers, openapi, routes/
│   ├── config/env.ts
│   ├── shared/
│   ├── container.ts
│   └── server.ts              # HTTP + varredura de expiração de pedidos
├── tests/
│   ├── unit/                  # domínio, assinatura de webhook, env, detecção de imagem
│   ├── integration/           # API real + PostgreSQL real
│   └── support/               # harness, preparação do banco de testes
├── Dockerfile
└── .env.example
```

## Multi-tenancy e isolamento

**Modelo.** `Tenant` representa uma loja. `User` é global; `Membership (userId, tenantId, role)` liga um usuário a uma ou mais lojas com um papel (`OWNER`, `ADMIN`, `OPERATOR`). Todas as entidades comerciais — categorias, produtos, variantes, imagens, movimentações, catálogos, links, clientes, endereços, pedidos, itens, histórico, pagamentos, eventos, categorias financeiras e lançamentos — têm coluna `tenantId` com índice. Chaves de negócio são únicas **por loja**: `(tenantId, slug)`, `(tenantId, sku)`, `(tenantId, number)`, `(tenantId, idempotencyKey)`, `(tenantId, phone)`.

**Estratégia de isolamento (na aplicação):**

1. Rotas administrativas exigem `Authorization: Bearer <jwt>` **e** `X-Tenant-Id`. O middleware `requireTenant` consulta o banco **a cada requisição** e só cria o contexto se existir `Membership` para aquele usuário e aquela loja (e a loja estiver ativa). Um `tenantId` sem associação recebe **403**. O JWT não carrega loja nem papel, então mudanças de papel valem imediatamente.
2. Todo método de repositório recebe `tenantId` explicitamente e o inclui no `WHERE` (inclusive em `update`/`delete`, feitos com `updateMany`/`deleteMany` filtrados por tenant). Um id de outra loja simplesmente "não existe" (**404**).
3. Rotas de vitrine resolvem a loja por `X-Store` (slug público) e só leem dados ativos. Links exclusivos são resolvidos pelo token, que identifica a loja.
4. O checkout carrega variantes filtrando por tenant; uma variante de outra loja aparece como `NOT_FOUND`.

**Testes que demonstram o isolamento** (`tests/integration/auth-tenancy.test.ts`): X-Tenant-Id de loja alheia → 403; leitura, edição, exclusão e movimentação de estoque de produto alheio → 404; vitrine e checkout de outra loja não enxergam nem vendem o produto; pedidos, clientes e financeiro não vazam entre lojas.

**Limitações.** O isolamento é garantido pela aplicação, não por Row Level Security do Postgres. A API conecta com um usuário de banco que enxerga todas as lojas; o acesso direto ao banco (ou à API REST automática do Supabase) não passa por estas regras. Recomendação: não expor o schema `public` pela API do Supabase (ver abaixo) e, no futuro, adicionar RLS com `SET app.tenant_id` como segunda barreira.

## Instalação e execução

Pré-requisitos: Node 22+, e um PostgreSQL (Supabase ou o do `docker compose` na pasta-mãe).

```bash
npm install
cp .env.example .env            # ajuste DATABASE_URL, DIRECT_URL e JWT_ACCESS_SECRET
npm run db:deploy               # aplica as migrations
SEED_ADMIN_PASSWORD='uma-senha-forte' npm run db:seed   # opcional
npm run dev                     # http://localhost:3350
```

- Documentação interativa: `http://localhost:3350/docs` (Swagger UI) e `http://localhost:3350/openapi.json`.
- Banco local: na pasta `PALACE/`, `docker compose up -d postgres` sobe o Postgres em `localhost:5452` (usuário/senha `commerce`, bancos `commerce` e `commerce_test`).

Scripts: `dev`, `build`, `start`, `start:prod` (migrate deploy + start), `typecheck`, `lint`, `test`, `test:unit`, `test:integration`, `db:generate`, `db:migrate` (cria migrations em dev), `db:deploy`, `db:seed`.

## Variáveis de ambiente

Validadas na inicialização (`src/config/env.ts`); a API não sobe com configuração inválida. Lista completa e comentada em [`.env.example`](.env.example).

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | sim | Conexão de runtime. No Supabase, o pooler (porta 6543). |
| `DIRECT_URL` | para migrations | Conexão direta (porta 5432), usada pelo Prisma CLI via `prisma.config.ts`. |
| `JWT_ACCESS_SECRET` | sim | ≥ 32 caracteres. Também deriva o segredo dos tokens de acompanhamento de pedido. |
| `CORS_ORIGINS` | sim | Origens autorizadas (vírgula). |
| `COOKIE_SECURE` / `COOKIE_SAMESITE` | produção | `true` obrigatório em produção; `none` só com HTTPS. |
| `PUBLIC_API_URL`, `STOREFRONT_URL` | pagamentos | URL de notificação e de retorno do comprador. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | upload | Sem elas, upload responde 503. |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` | pagamentos | Sem ambas, o checkout cria o pedido mas não gera cobrança. |
| `LOGIN_RATE_LIMIT` | não | Tentativas de login por IP a cada 15 min (padrão 10). |
| `EXPIRATION_SWEEP_SECONDS` | não | Intervalo da varredura de pedidos vencidos (0 desliga). |
| `TEST_DATABASE_URL` | testes | Banco descartável; o nome precisa conter `test`. |

## Supabase (banco e Storage)

**Banco**

1. Crie o projeto e copie as strings em *Project Settings → Database → Connection string*.
2. `DATABASE_URL` = *Transaction pooler* (porta **6543**). O driver `pg` usado pelo adapter não depende de prepared statements nomeados, então funciona com o pooler em modo transaction sem parâmetros extras.
3. `DIRECT_URL` = *Direct connection* (porta **5432**). O Prisma 7 lê a URL de migrations em `prisma.config.ts` (não existe mais `directUrl` no `schema.prisma`).
4. `npm run db:deploy`. Use `prisma migrate deploy` em produção; **não** use `db push`. Nunca rode `migrate reset` num banco com dados.
5. A migration `20261009010000_enable_rls` ativa RLS em todas as tabelas sem criar políticas: a API REST automática do Supabase (chaves publishable/anon) não enxerga nenhuma linha, enquanto esta API, que conecta como dona das tabelas, não é afetada. Opcionalmente, remova `public` dos *Exposed schemas* em *API → Settings*.

**Storage**

1. Crie um bucket (padrão `product-images`) **público para leitura**: as URLs das fotos vão para a vitrine.
2. Escrita e exclusão acontecem **somente** por esta API, com a chave `service_role` em `SUPABASE_SERVICE_ROLE_KEY`. Essa chave nunca vai para o frontend.
3. Caminhos: `{tenantId}/products/{productId}/{uuid}.{ext}`. Metadados (ordem, principal, alt, variante, MIME, tamanho) ficam em `ProductImage`; nenhum binário vai para o Postgres.
4. Verificação: `npx tsx --env-file=.env scripts/check-storage.ts` cria o bucket público se não existir e faz um upload, uma leitura pública e uma remoção de teste.
5. Validação: até `UPLOAD_MAX_BYTES` (5 MB padrão), tipos JPEG/PNG/WebP/AVIF conferidos pela **assinatura binária** do arquivo (não só pelo Content-Type). Se o metadado falhar após o upload, o arquivo é removido.

> Integração verificada contra um projeto Supabase real em 2026-10-09 (criação do bucket, upload, leitura pública e remoção). Os testes automatizados continuam usando um Storage em memória.

## Migrations e seed

- `prisma/migrations/20261008195612_init` cria o schema e acrescenta restrições que o Prisma não expressa: `CHECK (stock >= 0)`, `CHECK (quantity > 0)`, preço não negativo, promocional menor que o preço, valor financeiro positivo e índice parcial de **uma imagem principal por produto**.
- Novas mudanças: altere `schema.prisma` e rode `npm run db:migrate -- --name descricao` contra um banco de desenvolvimento; revise o SQL gerado antes de aplicar em produção.
- Seed (`npm run db:seed`): cria um administrador da plataforma, a loja de demonstração (categorias, produtos com variantes e estoque, catálogo geral, catálogo de campanha privado e um link exclusivo). Variáveis: `SEED_ADMIN_EMAIL` (padrão `admin@example.com`), `SEED_ADMIN_PASSWORD` (se ausente, uma senha aleatória é gerada e exibida uma vez), `SEED_STORE_SLUG`, `SEED_STORE_NAME`. Recusa-se a rodar com `NODE_ENV=production`. Para trocar a senha do admin de demonstração, rode o seed de novo com outro `SEED_ADMIN_PASSWORD`.

## Endpoints

Todos sob `/api/v1`, exceto `/health`, `/ready`, `/docs` e `/openapi.json`. **Dinheiro sempre em centavos inteiros** (ex.: `19990` = R$ 199,90). Erros: `{ "error": { "code", "message", "details?", "requestId" } }`.

Acesso: **público**; **loja** = exige `X-Store`; **usuário** = Bearer; **tenant** = Bearer + `X-Tenant-Id` (+ permissão do papel).

| Método e rota | Acesso | Descrição |
| --- | --- | --- |
| `POST /auth/login` · `/auth/refresh` · `/auth/logout` | público | Sessão (refresh em cookie httpOnly `rt`, rotação e detecção de reuso). |
| `GET /auth/me` | usuário | Perfil, lojas, papéis e permissões. |
| `GET /tenants` · `POST /tenants` | usuário | Lojas do usuário; criação só por admin da plataforma. |
| `GET /tenants/current` · `GET/POST /tenants/current/members` · `PATCH/DELETE /tenants/current/members/{userId}` | tenant | Loja atual e membros (`members:manage`). |
| `GET/PATCH /settings` | tenant | Moeda, prefixo de pedido, frete, prazo de pagamento, estoque baixo, contato. |
| `GET/POST /categories` · `PATCH /categories/{id}` | tenant | Categorias. |
| `GET/POST /products` · `GET/PATCH/DELETE /products/{id}` | tenant | Produtos; `DELETE` é desativação lógica. |
| `POST /products/{id}/variants` · `PATCH /products/{id}/variants/{variantId}` | tenant | Variantes (estoque só por movimentação). |
| `POST /products/{id}/images` · `PATCH/DELETE /products/{id}/images/{imageId}` | tenant | Upload multipart, alt, ordem, principal. |
| `POST /inventory/variants/{variantId}/movements` · `GET /inventory/movements` · `GET /inventory/low-stock` | tenant | Entrada, saída, ajuste e histórico. |
| `GET/POST /catalogs` · `GET/PATCH /catalogs/{id}` · `PUT /catalogs/{id}/products` · `POST/DELETE /catalogs/{id}/products/{productId}` | tenant | Catálogos e associação de produtos. |
| `GET/POST /catalog-links` · `PATCH /catalog-links/{id}` | tenant | Links exclusivos (ativar/desativar, expiração, limite). |
| `GET /customers` · `GET /customers/{id}` | tenant | Clientes. |
| `GET /orders` · `GET /orders/{id}` · `PATCH /orders/{id}/status` · `PATCH /orders/{id}/shipping` | tenant | Pedidos, status, envio, cancelamento, devolução. |
| `GET /dashboard` | tenant | Indicadores do painel. |
| `GET /finance/summary` · `GET /finance/transactions` · `PATCH /finance/transactions/{id}` · `POST /finance/expenses` · `POST /finance/incomes` · `GET/POST /finance/categories` · `GET /finance/reports/cashflow` | tenant | Financeiro. |
| `GET /public/store` · `/public/categories` · `/public/products` · `/public/products/{slug}` · `/public/catalogs` · `/public/catalogs/{slug}` · `/public/facets` | loja | Vitrine: produtos, catálogos públicos em vigor e valores para filtros (linhas, tamanhos, cores). |
| `GET /public/catalog-links/{token}` | público | Vitrine do link exclusivo. |
| `POST /checkout/quote` · `POST /checkout/orders` (`Idempotency-Key`) | loja | Recalcular carrinho e criar pedido. |
| `GET /public/orders/{number}` (`X-Order-Token`) · `POST /payments` | loja | Acompanhamento e (re)início do pagamento. |
| `POST /webhooks/payments/{provider}` | assinatura | Notificações do provedor. |

O documento OpenAPI é gerado dos mesmos schemas Zod usados na validação, então não diverge das rotas.

## Autenticação e autorização

- **Senhas:** Argon2id (m = 19 MiB, t = 2, p = 1, parâmetros OWASP). Login com e-mail inexistente também executa um hash, para não revelar quais e-mails existem.
- **Access token:** JWT HS256, 15 min (`ACCESS_TOKEN_TTL_SECONDS`), com `iss`/`aud` verificados. Contém apenas `sub` e `email`.
- **Refresh token:** opaco (256 bits), em cookie `httpOnly` restrito a `/api/v1/auth`, guardado no banco como SHA-256. Cada uso **rotaciona**; reutilizar um token já rotacionado **revoga a família inteira** (sinal de roubo). Há uma tolerância de 20 s para renovações simultâneas com o mesmo cookie (duas abas abertas, recarga durante uma renovação), que recebem uma sessão nova da mesma família em vez de derrubar o usuário. Validade: `REFRESH_TOKEN_TTL_DAYS` (30).
- **Papéis e permissões** (`src/domain/access/permissions.ts`):

| Permissão | OPERATOR | ADMIN | OWNER |
| --- | :-: | :-: | :-: |
| `catalog:read`, `orders:read`, `orders:write`, `inventory:write`, `customers:read` | ✓ | ✓ | ✓ |
| `catalog:write`, `finance:read`, `finance:write`, `settings:write` |  | ✓ | ✓ |
| `members:manage` |  |  | ✓ |

  Só OWNER atribui papéis, e a loja nunca fica sem OWNER. Criar lojas exige `User.isPlatformAdmin`.
- Token de link exclusivo **não** é credencial: só abre a vitrine do catálogo associado.

## Checkout e estoque

1. `POST /checkout/quote` recalcula itens, preços, frete e disponibilidade **a partir do banco**. Não reserva nada.
2. `POST /checkout/orders` (com `Idempotency-Key`) numa transação: revalida tudo, confere `expectedTotal` (se divergir → `409 PRICE_CHANGED`), **baixa o estoque** com `UPDATE ... SET stock = stock - q WHERE stock - q >= 0` em ordem fixa de variante, registra movimentações `SALE`, cria/atualiza o cliente, grava o pedido com **snapshots** (nome, SKU, variante, preço) e o histórico. Qualquer falha desfaz tudo.
3. Em seguida a API cria a cobrança no provedor e devolve `checkoutUrl` e o **token de acompanhamento** (mostrado ao comprador; o banco guarda só o hash).

**Regra de estoque (quando ocorre a baixa):** o estoque é validado e **baixado na criação do pedido** (não há reserva durante a navegação). O pedido aguarda pagamento por `pendingPaymentTtlMinutes` (60 min padrão, configurável por loja). Se o pagamento não for aprovado nesse prazo, a varredura (`EXPIRATION_SWEEP_SECONDS`) marca o pedido como `EXPIRED`, expira cobranças pendentes e **devolve o estoque** (`RELEASE`). Assim a mesma unidade nunca é vendida duas vezes e nenhum pedido pendente segura estoque indefinidamente.

**Concorrência:** o `UPDATE` condicional é atômico e o `CHECK (stock >= 0)` é a última barreira. O teste "compras concorrentes" dispara 8 pedidos simultâneos para 3 unidades: exatamente 3 são criados, o saldo final é 0.

**Idempotência:** `(tenantId, idempotencyKey)` é único. Repetir a chave devolve o pedido original (200, `replayed: true`), mesmo em corrida (a segunda transação colide na unicidade e lê o vencedor). O token de acompanhamento é derivado da chave (HMAC), então a repetição recebe o mesmo token.

**Estados do pedido e reversões:**

```
PENDING_PAYMENT ─▶ PAID ─▶ PREPARING ─▶ SHIPPED ─▶ DELIVERED
       │             │          │           │           │
       ├─▶ EXPIRED   └─▶ CANCELLED ◀────────┘           │
       └─▶ CANCELLED               SHIPPED/DELIVERED ─▶ RETURNED
```

- `PAID` só é definido pela confirmação do provedor; `EXPIRED` só pela varredura. O painel não consegue marcar nenhum dos dois.
- `CANCELLED`/`EXPIRED` antes do envio devolvem o estoque (`RELEASE`).
- `RETURNED` devolve ao estoque apenas se `restock: true` (conferência física), com movimentação `RETURN`.
- Cancelar um pedido pago **não estorna** o pagamento automaticamente (ver roadmap).
- Toda transição é condicional ao status atual: duas operações simultâneas não aplicam efeitos duas vezes.

**Frete:** porta `ShippingCalculator`. A implementação atual (`StoreRuleShippingCalculator`) aplica a regra da loja: valor fixo, grátis a partir de um subtotal ou sempre grátis. Não há integração com transportadoras; uma integração futura implementa a mesma porta.

## Pagamentos e webhooks

Abstração `PaymentProvider` (`application/ports/services.ts`): `createCheckout`, `parseWebhook` (valida assinatura) e `fetchPayment` (consulta o estado real).

**Mercado Pago (Checkout Pro)** — `infrastructure/payments/mercadopago.provider.ts`:

- Cria uma *preferência* com os itens (frete como item, para a soma bater com o total), `external_reference` único por cobrança, `notification_url`, URLs de retorno e expiração igual ao prazo do pedido. Pix ou cartão é escolhido excluindo os outros tipos de pagamento. O comprador paga na página do Mercado Pago: **esta API nunca recebe dados de cartão**.
- Webhook `POST /api/v1/webhooks/payments/mercadopago`: valida `x-signature` (HMAC-SHA256 do manifesto `id:{data.id};request-id:{x-request-id};ts:{ts};` com `MERCADOPAGO_WEBHOOK_SECRET`), registra o evento com chave de idempotência (`PaymentEvent (provider, eventKey)` único) e **consulta `GET /v1/payments/{id}`**: o corpo do webhook nunca é tratado como fonte de verdade.
- Na transação: trava o pagamento, ignora regressões (ex.: "pending" chegando depois de "approved"), confere o valor pago com o valor do pedido (divergência não marca como pago), muda o pedido para `PAID` e cria **uma** receita (`FinancialTransaction.paymentId` é único).
- Pagamento aprovado depois da expiração do pedido é registrado como aprovado, o pedido não muda e o evento fica com resultado `approved-order-not-pending` para conferência manual.
- O redirecionamento do navegador para `/checkout/sucesso` **não** confirma nada.

**Configurar e testar em sandbox:**

1. Em *Mercado Pago Developers → Suas integrações*, crie uma aplicação e copie o **Access Token de teste** para `MERCADOPAGO_ACCESS_TOKEN`.
2. Em *Webhooks*, cadastre `https://SEU_DOMINIO/api/v1/webhooks/payments/mercadopago`, evento **Pagamentos**, e copie a **assinatura secreta** para `MERCADOPAGO_WEBHOOK_SECRET`. Em desenvolvimento, exponha a API com um túnel HTTPS (ex.: `cloudflared tunnel --url http://localhost:3350`) e use essa URL em `PUBLIC_API_URL`.
3. Faça um pedido pela loja, pague com um usuário comprador de teste e cartões de teste do Mercado Pago, e acompanhe `PaymentEvent` e o status do pedido.

> **Limitação honesta:** o adaptador segue a documentação pública do Mercado Pago, mas **não foi exercitado contra o sandbox** nesta fase (não havia credenciais). Os testes automatizados usam um provedor falso e cobrem apenas a lógica desta API (assinatura, idempotência, transições, receita única). Sem credenciais, `GET /ready` informa `payments: []` e o checkout responde `payment.status = "NOT_CONFIGURED"`; nenhum pagamento é simulado como aprovado.

## Financeiro

Lançamentos (`FinancialTransaction`) de receita ou despesa, com categoria, **data de competência**, **data de pagamento/recebimento**, forma de pagamento, status (`PENDING`, `PAID`, `CANCELLED`) e referência a pedido/pagamento. Lojas novas recebem categorias padrão (a de sistema "Vendas" recebe as receitas de pedidos).

Indicadores de `GET /finance/summary` (período `from` inclusivo, `to` exclusivo; padrão: mês corrente UTC):

| Campo | Critério |
| --- | --- |
| `ordersCreated` | Pedidos **criados** no período, qualquer status (valor bruto). |
| `salesApproved` | Pedidos com **pagamento aprovado** no período (`paidAt`). |
| `received` | Receitas `PAID` com **data de recebimento** no período. |
| `incomeByCompetence` | Receitas não canceladas com **competência** no período. |
| `expensesPaid` | Despesas `PAID` com **data de pagamento** no período. |
| `expensesByCompetence` | Despesas não canceladas com **competência** no período. |
| `cashResult` | `received − expensesPaid` (regime de caixa). **Não é lucro**: custo de mercadoria, impostos e tarifas do provedor não são modelados. |

Webhooks repetidos não duplicam receita (unicidade por `paymentId`). Estorno (`REFUNDED`) cancela a receita correspondente. `GET /finance/reports/cashflow?groupBy=day|month` devolve a série de lançamentos pagos.

## Segurança

- **CORS:** apenas `CORS_ORIGINS`, com credenciais (necessário para o cookie de refresh). Requisições sem `Origin` (servidor a servidor, webhooks) são aceitas.
- **Validação:** todo body/query/params passa por Zod; corpo JSON limitado a 200 KB; uploads limitados por `UPLOAD_MAX_BYTES`.
- **Rate limiting** (em memória, por IP): login `LOGIN_RATE_LIMIT` por 15 min (padrão 10); renovação de sessão 300 por 15 min; checkout/pagamentos 30 por minuto; demais rotas 600 por minuto. Com várias instâncias, troque por um store compartilhado (Redis).
- **Cabeçalhos:** Helmet (CSP, HSTS, etc.); `x-powered-by` desativado; `trust proxy` em produção.
- **Logs:** pino estruturado (JSON em produção; formato legível em desenvolvimento quando `pino-pretty` está instalado) com `requestId` (também devolvido em `X-Request-Id`); `Authorization`, cookies, `X-Order-Token`, senhas e tokens são redigidos.
- **Erros:** formato único; erros inesperados viram 500 genérico sem stack para o cliente.
- **Dados públicos mínimos:** a vitrine não expõe estoque exato (só `ok`/`low`/`out`), ids de tenant, caminhos de Storage nem dados de clientes. Números de pedido não são sequenciais; o acompanhamento exige o token do pedido.
- **Produção:** a API recusa iniciar com `COOKIE_SECURE=false`, com o segredo JWT de exemplo ou com Mercado Pago sem segredo de webhook.

## Testes

```bash
docker compose up -d postgres     # na pasta PALACE/ (ou aponte TEST_DATABASE_URL para outro Postgres)
npm test                          # unitários + integração
npm run test:unit                 # sem banco
```

Os testes de integração sobem a API real contra um PostgreSQL real (`TEST_DATABASE_URL`, cujo nome precisa conter `test`). Antes da execução o schema é recriado e as **mesmas migrations** de produção são aplicadas; entre testes as tabelas são truncadas. Sem banco acessível, os testes de integração são ignorados com aviso.

Somente dependências externas usam dublês: `FakePaymentProvider` e `MemoryStorage` (`tests/support/harness.ts`). Eles **não** comprovam a integração real com Mercado Pago ou Supabase.

Cobertura atual (59 testes): validação de produto; isolamento entre lojas; autorização por papel; sessão (rotação, tolerância a renovação simultânea e revogação por reuso de refresh token); catálogos públicos e privados, listagem de catálogos em vigor e filtros da vitrine; validade, expiração, desativação e limite de uso de links; recálculo de preço no servidor; total divergente; estoque insuficiente; compras concorrentes; idempotência (inclusive concorrente); webhooks repetidos, fora de ordem, com assinatura inválida e com valor divergente; cancelamento e expiração com devolução de estoque; cálculos financeiros; upload com validação de tipo real; health/ready/OpenAPI.

## Docker e deploy

```bash
docker build -t commerce-api .
docker run --env-file .env -p 3350:3350 commerce-api
```

Imagem multi-stage `node:22-alpine`, executando como usuário `node` (não privilegiado), com `HEALTHCHECK` em `/health`. O comando padrão é `npm run start:prod`: aplica migrations pendentes (`prisma migrate deploy`) e inicia a API.

Deploy (qualquer plataforma de containers: Render, Fly.io, Railway, Cloud Run…):

1. Configure as variáveis de produção (`NODE_ENV=production`, `COOKIE_SECURE=true`, `DATABASE_URL` com pooler, `DIRECT_URL`, segredos, `CORS_ORIGINS` com o domínio da loja, `PUBLIC_API_URL`, `STOREFRONT_URL`).
2. Se loja e API estiverem em **domínios diferentes**, use `COOKIE_SAMESITE=none` (exige HTTPS). Em subdomínios do mesmo site (`loja.exemplo.com` / `api.exemplo.com`), `lax` funciona.
3. `ENABLE_API_DOCS=false` se não quiser `/docs` público.
4. Readiness: `GET /ready` (verifica o banco e informa Storage e pagamentos configurados).
5. A varredura de expiração roda em cada instância; é segura em paralelo.

## Troubleshooting

| Sintoma | Causa provável |
| --- | --- |
| `Variáveis de ambiente inválidas` na inicialização | Veja a lista impressa; em produção `COOKIE_SECURE` e o segredo JWT são exigidos. |
| `P1001` / não conecta ao banco | `DATABASE_URL` errada, porta bloqueada ou projeto Supabase pausado. |
| Muitas conexões abertas no Supabase | Use o pooler (porta 6543) em `DATABASE_URL`; a conexão direta fica só para migrations. |
| Migrations travam no pooler | Rode migrations com `DIRECT_URL` (porta 5432). |
| `403 Você não tem acesso a esta loja` | `X-Tenant-Id` não corresponde a uma associação do usuário. |
| Login funciona mas o refresh falha em produção | Cookie bloqueado: confira HTTPS, `COOKIE_SECURE=true` e `COOKIE_SAMESITE` adequado ao domínio. |
| Upload responde 503 | `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` ausentes. |
| Checkout com `payment.status = NOT_CONFIGURED` | Faltam `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET`. |
| Webhook responde 401 | Segredo de assinatura diferente do painel do Mercado Pago, ou proxy alterando o corpo/cabeçalhos. |
| `certificate is not yet valid` / erro de certificado ao conectar | Relógio local adiantado/atrasado ou cadeia do Supabase não confiável no ambiente. Use `?uselibpqcompat=true&sslmode=require` (TLS sem verificação de cadeia) ou `sslmode=verify-full` com o certificado do Supabase (`sslrootcert`). |
| Testes de integração "skipped" | `TEST_DATABASE_URL` ausente ou banco inacessível. |

## Decisões técnicas

- **Express 5 + Zod com um `route()` próprio**: validação, tipagem do handler e documentação OpenAPI saem da mesma definição, sem duplicar contratos.
- **Repositórios atrás de portas + Unit of Work**: casos de uso testáveis e sem Prisma; transações explícitas onde há regra de concorrência (checkout, estoque, webhooks, expiração).
- **Dinheiro em centavos inteiros** na aplicação e na API, `Decimal(12,2)` no banco. Nada de ponto flutuante em somas.
- **Baixa de estoque na criação do pedido + expiração**, em vez de reserva no carrinho: simples, sem estoque "fantasma" e sem venda dupla.
- **Isolamento por tenant na aplicação** com `tenantId` explícito em todas as chamadas; RLS fica como evolução.
- **JWT curto sem claims de tenant** + verificação de associação no banco a cada requisição: revogar acesso a uma loja tem efeito imediato.
- **Checkout Pro do Mercado Pago**: Pix e cartão sem tocar em dados de cartão (escopo PCI mínimo).
- **Número de pedido aleatório** (8 caracteres sem ambiguidade) em vez de sequencial: não permite enumerar pedidos.

## Limitações e roadmap

Implementado e testado nesta fase: tudo descrito acima, exceto o que está marcado como não verificado.

Não verificado contra serviços reais (sem credenciais): Mercado Pago e Supabase Storage.

Pendências conhecidas:

- Cupons/descontos (o campo existe, sempre 0).
- Estorno automático no provedor ao cancelar pedido pago.
- E-mails e notificações (confirmação de pedido, link de acompanhamento).
- Integração com transportadoras (porta `ShippingCalculator` pronta).
- Rate limit distribuído (Redis) para múltiplas instâncias.
- Row Level Security como segunda barreira de isolamento.
- Ordenação por preço considera o preço cheio do produto (não o promocional nem o de variantes).
- Busca textual simples (`contains`); sem busca full-text.
- Auditoria administrativa geral (hoje: histórico de pedidos e movimentações de estoque).
