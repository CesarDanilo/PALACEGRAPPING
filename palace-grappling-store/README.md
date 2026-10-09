# palace-grappling-store

Loja digital e painel administrativo da **Palace Grappling** (Brazilian Jiu-Jitsu e esportes de combate). Consome a [`commerce-api`](../commerce-api) apenas pelo contrato HTTP e não importa nenhum arquivo do backend.

- **Direção visual:** [`../docs/DIRECAO-VISUAL.md`](../docs/DIRECAO-VISUAL.md), derivada das três referências.
- **Sistema visual:** [`DESIGN.md`](DESIGN.md), com tokens, tipografia, marca e regras de uso.

## Tecnologias

| Item | Versão |
| --- | --- |
| React | 19.3 |
| TypeScript | 6.0 (strict, `noUncheckedIndexedAccess`) |
| Vite | 8.3 |
| React Router | 7.18 (data router, painel e checkout carregados sob demanda) |
| TanStack Query | 5.104 |
| React Hook Form + Zod | 7.89 + 4.6 (`@hookform/resolvers` 5) |
| Fontes | Barlow Condensed, Inter e IBM Plex Mono via Fontsource (sem CDN externo) |
| Testes | Vitest 5 + Testing Library (unitários e componentes), Playwright 1.63 (E2E) |

Não há biblioteca de componentes: os primitivos são próprios (`src/components/ui`), em CSS Modules e tokens.

## Estrutura de pastas

```
palace-grappling-store/
├── public/                    # favicon
├── src/
│   ├── app/                   # App (providers), router, admin-routes (pacote do painel)
│   ├── brand/                 # logotipo, monograma, faixa com graus, selo circular
│   ├── components/
│   │   ├── ui/                # Button, campos, alertas, estados, toast
│   │   ├── store/             # card/grade de produto, preço, listagem com filtros, seções
│   │   ├── media/             # foto oficial ou ilustração temporária
│   │   └── icons.tsx          # ícones SVG de traço único
│   ├── content/media.ts       # slots de fotos editoriais (trocar pelas oficiais aqui)
│   ├── features/
│   │   ├── admin-auth/        # sessão do painel
│   │   ├── cart/              # carrinho local + cotação no servidor
│   │   ├── catalog/           # regras de seleção de variante
│   │   └── checkout/          # schema, idempotência, tokens de acompanhamento
│   ├── layouts/               # StoreLayout e AdminLayout
│   ├── lib/api/               # client (fetch + sessão), contrato, endpoints da loja e do painel
│   ├── pages/store/           # home, listagens, produto, carrinho, checkout, pedidos, institucionais
│   ├── pages/admin/           # login, painel e todas as seções administrativas
│   └── styles/                # tokens.css e base.css
├── tests/                     # Vitest
├── e2e/                       # Playwright
├── Dockerfile · nginx.conf · playwright.config.ts
└── .env.example
```

## Instalação e execução local

```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:5190 (a API deve estar em http://localhost:3350)
```

Em desenvolvimento o Vite encaminha `/api` para a API (`DEV_API_PROXY_TARGET`). Assim loja e API ficam na mesma origem e o cookie de sessão funciona com `SameSite=Lax`.

Para acessar o painel, abra `http://localhost:5190/admin/login` e entre com o usuário do seed da API (`admin@example.com` e a senha definida em `SEED_ADMIN_PASSWORD`).

Scripts: `dev`, `build` (typecheck + build), `preview`, `typecheck`, `lint`, `test`, `test:e2e`.

## Variáveis de ambiente

| Variável | Descrição |
| --- | --- |
| `VITE_API_URL` | URL da API. Vazio = mesma origem (`/api/v1`). Com domínios separados, use a URL completa e inclua a origem da loja em `CORS_ORIGINS` da API. |
| `VITE_STORE_SLUG` | Slug da loja na API (cabeçalho `X-Store`). Padrão `palace-grappling`. |
| `DEV_API_PROXY_TARGET` | Só desenvolvimento: destino do proxy `/api`. |

Variáveis `VITE_*` são públicas e entram no build. **Nunca** coloque chaves no frontend (como a `service_role` do Supabase ou tokens do Mercado Pago).

## Build e Docker

```bash
npm run build
docker build --build-arg VITE_API_URL=https://api.exemplo.com -t palace-grappling-store .
docker run -p 8090:8080 palace-grappling-store
```

A imagem é multi-stage: o build roda em `node:22-alpine` e o site é servido por `nginx-unprivileged` na porta 8080, com fallback de SPA, cache longo em `/assets` e cabeçalhos de segurança. Como `VITE_*` entra no build, trocar a API exige novo build.

O bundle principal da loja não inclui o painel nem o checkout, que são carregados sob demanda.

## Rotas

**Loja**

| Rota | Conteúdo |
| --- | --- |
| `/` | Homepage editorial: hero com mini-card do último lançamento, benefícios, lançamentos, linhas Gi/No-Gi, categorias + colagem, campanha com contagem regressiva real, destaques, manifesto, inspiração. |
| `/loja` | Vitrine completa: busca (`q`), linha, categoria, tamanho, cor, disponibilidade, ordenação e paginação na URL. |
| `/colecoes` | Mosaico de catálogos públicos e categorias. |
| `/categoria/:slug` | Produtos da categoria. |
| `/produto/:slug` | Galeria, variantes obrigatórias, quantidade, guia de tamanhos, entrega, relacionados. |
| `/catalogo/:slug` | Catálogo público compartilhável. |
| `/c/:token` | Link exclusivo: a seleção é limitada ao catálogo e o pedido registra a origem. |
| `/carrinho` · `/checkout` · `/checkout/sucesso` | Carrinho cotado no servidor, checkout e retorno. |
| `/pedido/:orderNumber` · `/pedidos` | Acompanhamento e pedidos deste navegador. |
| `/sobre` · `/contato` · `/politicas` | Institucionais. |

**Painel** (rotas protegidas): `/admin/login`, `/admin`, `/admin/produtos`, `/admin/produtos/novo`, `/admin/produtos/:id`, `/admin/categorias`, `/admin/estoque`, `/admin/pedidos`, `/admin/pedidos/:id`, `/admin/clientes`, `/admin/clientes/:id`, `/admin/catalogos`, `/admin/links`, `/admin/financeiro`, `/admin/financeiro/receitas`, `/admin/financeiro/despesas`, `/admin/relatorios`, `/admin/configuracoes`.

O menu mostra só as seções permitidas ao papel, e a API revalida cada chamada.

Nenhuma URL leva dados de cliente:
- O link exclusivo carrega só o token do catálogo.
- O acompanhamento usa o número público do pedido e um token guardado no navegador do comprador (enviado em `X-Order-Token`).

## Funcionalidades

**Loja**
- Carrinho persistente, com cotação recalculada pela API a cada mudança.
- O checkout envia `expectedTotal`. Se o preço mudar, a API recusa e a tela pede revisão.
- O pedido usa chave de idempotência por tentativa, então clique duplo ou recarregar não cria pedido em dobro.
- Pagamento no ambiente do Mercado Pago (Pix ou cartão). A tela de retorno mostra o status vindo da API e atualiza sozinha enquanto o pagamento estiver pendente.

**Painel**
- **Produtos:** cadastro, edição e desativação. Variantes com estoque inicial; fotos com upload, texto alternativo, ordem e foto principal.
- **Estoque e categorias:** entradas, saídas, ajustes de inventário e histórico; alerta de estoque baixo. Categorias editáveis na própria lista.
- **Catálogos e links:** catálogos com período e produtos; links exclusivos com expiração, limite de pedidos, ativação e cópia da URL.
- **Pedidos e clientes:** filtros por status e busca, próximas ações por status, envio com rastreio, cancelamento e devolução com reintegração de estoque. Clientes com histórico.
- **Financeiro:** resumo mensal com critérios explicados, receitas avulsas, despesas, marcar como pago ou cancelar, relatório anual de fluxo de caixa.
- **Configurações:** frete, prazo de pagamento, alerta de estoque, prefixo do pedido, contatos e equipe.

## Integração com a API

- `src/lib/api/client.ts` monta os cabeçalhos: `X-Store` na loja, `Authorization` + `X-Tenant-Id` no painel.
- Erros chegam tipados (`ApiError` com `code` e `message` da API).
- Em 401, o client renova a sessão uma vez via `/auth/refresh` e repete a requisição.
- O access token fica só em memória. O refresh token está em cookie `httpOnly`, que o JavaScript não lê.
- `src/lib/api/types.ts` e `admin.ts` descrevem o contrato consumido. A fonte de verdade é `GET /openapi.json` da API.
- Dinheiro chega em centavos, e `formatMoney` é a única conversão para exibição.

## Trocar as imagens temporárias pelas fotos oficiais

- **Fotos de produto:** envie pelo painel em *Produtos → produto → Fotos*. Elas vão para o Supabase Storage com o texto alternativo cadastrado.
- **Fotos editoriais** (hero, linhas, manifesto, inspiração, sobre):
  1. Coloque o arquivo em `public/media/`.
  2. Em `src/content/media.ts`, preencha o `src` do slot e revise o `alt`.

  Cada slot traz um `brief` com a foto esperada.

Enquanto `src` for `null`, a loja mostra uma ilustração geométrica com o selo "Foto temporária". Ela nunca se apresenta como foto oficial.

## Personalizar a identidade

- **Cores, fontes, espaçamentos e raios:** `src/styles/tokens.css`. As fontes importadas ficam em `src/styles/base.css`.
- **Logotipo e monograma:** `src/brand/Brand.tsx` (SVG).
- **Textos de marca:** `src/pages/store/HomePage.tsx` e `StorePages.tsx`.

## Testes

```bash
npm test             # 20 testes Vitest
npm run test:e2e     # 6 testes Playwright (desktop + mobile)
```

**Vitest**
- Dinheiro, seleção obrigatória de variante, carrinho e schema do checkout.
- Card de produto: o "+" só adiciona direto quando há uma única variante, há selo de esgotado e a ilustração vem marcada como temporária.
- Mídia oficial e contagem regressiva.
- Painel: redirecionamento sem sessão, login com `Authorization`/`X-Tenant-Id` e erro de credenciais; cabeçalho `X-Store`.

**Playwright** (loja e API reais, com banco e seed)
- Compra completa: variante obrigatória, termos obrigatórios e pedido criado aguardando pagamento.
- Link exclusivo inválido.
- Painel exigindo login e listando o pedido.

A API precisa estar no ar com o seed, e `E2E_ADMIN_PASSWORD` deve ser igual a `SEED_ADMIN_PASSWORD`. Os testes também rodam contra a stack Docker: `E2E_BASE_URL=http://localhost:8090 npm run test:e2e`.

## Limitações e pendências

- Não há fotografias oficiais: a loja usa ilustrações temporárias identificadas.
- Não há conta de cliente. Os pedidos ficam acessíveis no navegador da compra, pelo token de acompanhamento.
- Não há newsletter, porque não existe serviço real configurado.
- Gestão de membros pelo painel: só listagem. Convites e papéis existem na API.
- A página de políticas é texto-modelo e precisa de revisão da loja antes de vender.
- A busca de CEP é manual (sem preenchimento automático de endereço).
