# palace-grappling-store

Loja digital e painel administrativo da **Palace Grappling** (Brazilian Jiu-Jitsu e esportes de combate). Consome a [`commerce-api`](../commerce-api) apenas pelo contrato HTTP: não importa nenhum arquivo do backend.

> Estado: **fase 1 (fundação)**. Rotas, integração com a API, sessão administrativa, carrinho, regras de variante e validação de checkout estão prontos e testados. A **identidade visual e os layouts da loja aguardam a análise das três imagens de referência**; até lá as páginas públicas usam uma estrutura provisória (`PageShell`). Veja [Limitações e pendências](#limitações-e-pendências).

## Tecnologias

| Item | Versão |
| --- | --- |
| React | 19.3 |
| TypeScript | 6.0 (strict) |
| Vite | 8.3 |
| React Router | 7.18 (modo data router) |
| TanStack Query | 5.104 |
| React Hook Form + Zod | 7.89 + 4.6 (`@hookform/resolvers` 5) |
| Fontes | Barlow Condensed (display) e Inter (texto), via Fontsource, sem CDN externo |
| Testes | Vitest 5, Testing Library, jsdom |

Sem biblioteca de componentes: primitivos próprios em `src/components/ui`, estilizados com CSS Modules e tokens.

## Estrutura de pastas

```
palace-grappling-store/
├── public/                    # favicon e arquivos estáticos
├── src/
│   ├── app/                   # App (providers) e router (todas as rotas)
│   ├── components/ui/         # Button, TextField, SelectField, Alert, estados, badges
│   ├── config/env.ts          # variáveis VITE_*
│   ├── features/
│   │   ├── admin-auth/        # sessão do painel (login, refresh, troca de loja)
│   │   ├── cart/              # carrinho local (useSyncExternalStore + localStorage)
│   │   ├── catalog/           # regras de seleção de variante
│   │   └── checkout/          # schema Zod do checkout, tokens de acompanhamento
│   ├── layouts/               # StoreLayout (loja) e AdminLayout (painel)
│   ├── lib/
│   │   ├── api/               # client (fetch + sessão), contrato (types), storefront
│   │   └── money.ts           # formatação de centavos
│   ├── pages/
│   │   ├── store/             # páginas públicas (estrutura provisória)
│   │   └── admin/             # login, painel e seções
│   └── styles/                # tokens.css e base.css
├── tests/                     # lógica, fluxos do painel e da loja
├── Dockerfile · nginx.conf
└── .env.example
```

## Instalação e execução

```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:5190 (a API deve estar em http://localhost:3350)
```

Em desenvolvimento o Vite encaminha `/api` para a API (`DEV_API_PROXY_TARGET`), então loja e API ficam na mesma origem e o cookie de sessão funciona com `SameSite=Lax`.

Painel: `http://localhost:5190/admin/login`, com o usuário criado pelo seed da API (`admin@example.com` e a senha definida em `SEED_ADMIN_PASSWORD`).

Scripts: `dev`, `build` (typecheck + build), `preview`, `typecheck`, `lint`, `test`.

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `VITE_API_URL` | URL da API. Vazio = mesma origem (`/api/v1`). Em produção com domínios separados, use a URL completa. |
| `VITE_STORE_SLUG` | Slug da loja na API (enviado no cabeçalho `X-Store`). Padrão `palace-grappling`. |
| `DEV_API_PROXY_TARGET` | Só desenvolvimento: destino do proxy `/api`. |

Variáveis `VITE_*` são públicas e embutidas no build. **Nunca** coloque chaves (ex.: `service_role` do Supabase ou tokens do Mercado Pago) no frontend.

## Build e Docker

```bash
npm run build                    # gera dist/
docker build --build-arg VITE_API_URL=https://api.exemplo.com -t palace-grappling-store .
docker run -p 8090:8080 palace-grappling-store
```

Imagem multi-stage: build em `node:22-alpine`, servida por `nginx-unprivileged` (porta 8080, usuário sem privilégios), com fallback de SPA, cache longo para `/assets` e cabeçalhos de segurança. Como `VITE_*` entra no build, trocar a URL da API exige novo build.

## Rotas

**Loja** (`StoreLayout`): `/`, `/colecoes`, `/categoria/:slug`, `/produto/:slug`, `/catalogo/:slug`, `/c/:token` (link exclusivo), `/carrinho`, `/checkout`, `/checkout/sucesso`, `/pedido/:orderNumber`, `/sobre`, `/contato` e 404.

**Painel** (`AdminLayout`, protegido): `/admin/login`, `/admin`, `/admin/produtos`, `/admin/produtos/novo`, `/admin/categorias`, `/admin/estoque`, `/admin/pedidos`, `/admin/pedidos/:id`, `/admin/clientes`, `/admin/catalogos`, `/admin/links`, `/admin/financeiro`, `/admin/financeiro/receitas`, `/admin/financeiro/despesas`, `/admin/relatorios`, `/admin/configuracoes`. Itens do menu aparecem conforme as permissões do papel; a API revalida tudo.

Privacidade nas URLs: links exclusivos carregam só o token do catálogo; o acompanhamento de pedido usa o número público e um token guardado no navegador do comprador (`X-Order-Token`), nunca dados do cliente na URL.

## Integração com a API

- `src/lib/api/client.ts`: `fetch` com cabeçalhos de loja (`X-Store`) ou de painel (`Authorization` + `X-Tenant-Id`), erros tipados (`ApiError` com `code` e `message` da API) e renovação automática: em 401, chama `/auth/refresh` uma vez e repete a requisição.
- Sessão do painel: access token **só em memória**; refresh token em cookie `httpOnly` que o JavaScript não lê. Recarregar a página restaura a sessão pelo refresh.
- `src/lib/api/types.ts`: contrato consumido. A fonte de verdade é `GET /openapi.json` da API.
- Dinheiro chega em **centavos**; `formatMoney` é a única conversão para exibição.
- O carrinho guarda variante e quantidade; preços exibidos devem vir de `POST /checkout/quote`, e o pedido envia `expectedTotal` para que a API recuse se os valores mudarem. O navegador nunca define preço nem disponibilidade.

## Componentes e design system

Tokens em `src/styles/tokens.css` (cores, papéis semânticos, tipografia, espaçamento, bordas, interação, camadas, controles). **São provisórios**, derivados da paleta do briefing:

- preto profundo dominante (`--color-black`), branco para títulos e texto, grafites para superfícies;
- verde-limão (`--accent`) reservado a CTAs, indicadores, preços promocionais e foco;
- display condensado e pesado (Barlow Condensed 800) + sans legível (Inter).

Primitivos: `Button` (primary, secondary, ghost, danger), `TextField`/`SelectField` (label associado, `aria-invalid`, erro anunciado), `Alert`, `LoadingState`, `EmptyState`, `AvailabilityBadge`.

Loja e painel usam os mesmos tokens com tratamentos diferentes: loja com cantos retos e tipografia display; painel com superfícies funcionais, cantos levemente arredondados e números tabulares.

Acessibilidade já aplicada: link "pular para o conteúdo", foco visível em todo elemento interativo, labels em todos os campos, regiões e tabelas semânticas, `prefers-reduced-motion`.

**Personalizar a identidade:** altere os tokens em `tokens.css` e as fontes importadas em `base.css`; componentes não usam valores literais.

## Imagens temporárias e fotos oficiais

Ainda não há fotografias no projeto. Quando os layouts forem construídos, toda imagem temporária ficará identificada como tal e centralizada em um único módulo de mídia, para ser trocada sem tocar nos componentes. Fotos de produto vêm sempre da API (`images[].url`, enviadas pelo painel para o Supabase Storage), com o texto alternativo cadastrado.

## Testes

```bash
npm test
```

- `tests/logic.test.ts`: dinheiro, seleção obrigatória de tamanho/cor e bloqueio de variante esgotada, carrinho (soma, limites, persistência, troca de contexto), validação do checkout.
- `tests/admin-flow.test.tsx`: redirecionamento sem sessão, validação e login com envio de `Authorization` e `X-Tenant-Id`, erro de credenciais, cabeçalho `X-Store` e estado de erro na loja.

A API é simulada no nível do `fetch` nesses testes; a API real é coberta pelos testes de integração do backend.

## Limitações e pendências

- **Direção visual pendente:** as três imagens de referência não foram recebidas. Homepage editorial, listagem, página de produto, carrinho, checkout e páginas institucionais têm rotas, dados e estados, mas não o layout final.
- Logotipo e monograma originais: a criar na fase 2 (o favicon atual é provisório).
- Formulário de checkout: schema e regras prontos; a tela completa vem na fase 2/4.
- Seções do painel além do painel inicial (produtos, estoque, pedidos, catálogos, links, financeiro, configurações): rotas e permissões prontas, telas na fase 3/4. Os endpoints já existem na API.
- Newsletter: não implementada (não há serviço real configurado).
