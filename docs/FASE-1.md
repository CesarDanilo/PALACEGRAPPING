# Fase 1: análise e fundação

Data: 2026-10-08.

## 1. Referências visuais

**As três imagens de referência não foram recebidas.** Nenhuma análise visual foi feita e nenhuma decisão de layout foi tirada delas. Assim que as imagens forem anexadas, este documento ganha o resumo da direção visual identificada (paleta e contraste, tipografia, composição de banners, navegação, grades de produto, hierarquia de preço e CTA, espaço negativo, tratamento de coleções e comportamento responsivo) e os tokens são revisados.

## 2. Proposta preliminar de identidade (só a partir do briefing)

Baseada exclusivamente no texto do briefing, para ser confirmada ou corrigida pelas referências:

- **Cor:** preto profundo dominante, branco para títulos e texto, grafites para superfícies secundárias, verde-limão apenas em CTA principal, indicadores, preço promocional, foco e pequenos detalhes.
- **Tipografia:** display condensada e pesada em caixa alta (provisória: Barlow Condensed 800) com sans moderna para texto, preços e formulários (Inter).
- **Loja:** cantos retos, divisores finos, fotografia grande e composições assimétricas no desktop; hierarquia simples e navegação curta no mobile. Evitar cards arredondados com sombra e aparência de dashboard.
- **Painel:** escuro, funcional, números tabulares, leve arredondamento, foco em produtividade.
- **Logotipo:** a criar na fase 2, tipográfico e original, com opção de monograma geométrico. Nada de reutilizar marcas das referências.

Tudo isso está codificado em `palace-grappling-store/src/styles/tokens.css`, marcado como provisório.

## 3. Estrutura dos projetos

```
PALACE/
├── commerce-api/             # backend genérico (ver README)
├── palace-grappling-store/   # loja + painel (ver README)
├── docker/postgres-init.sql  # cria o banco de testes no Postgres local
├── docker-compose.yml        # opcional: postgres; perfil "full" sobe API e loja
└── docs/
```

O briefing sugeria a pasta `palace-grappling/`; usei `PALACE/` como raiz porque foi o caminho indicado para o projeto.

## 4. Arquitetura do backend

Camadas `domain` → `application` (casos de uso + portas) → `infrastructure` (Prisma, Supabase, Mercado Pago, Argon2/JWT) e `presentation` (Express, Zod, OpenAPI). Controllers não acessam Prisma; regras de estado, preço, permissões e links vivem no domínio. Detalhes no [README da API](../commerce-api/README.md#arquitetura-em-camadas).

## 5. Multi-tenancy e isolamento

`Tenant` = loja; `Membership` liga usuários a lojas com papel `OWNER`/`ADMIN`/`OPERATOR`. Todas as tabelas comerciais têm `tenantId` indexado e chaves únicas compostas com ele. O tenant administrativo vem de `X-Tenant-Id` e é **verificado no banco a cada requisição**; repositórios recebem `tenantId` explicitamente em toda leitura e escrita. Testes provam que uma loja não lê nem altera dados de outra. Limitação: isolamento na aplicação, sem RLS (documentado). Detalhes no [README da API](../commerce-api/README.md#multi-tenancy-e-isolamento).

## 6. O que foi entregue

Backend (`commerce-api`), além da fundação prevista para a fase 1, já com o domínio das fases 3 e 4 implementado e testado:

- Schema Prisma completo com migration versionada e restrições extras (estoque nunca negativo, preços válidos, uma imagem principal por produto).
- Autenticação (Argon2id, JWT curto, refresh com rotação e detecção de reuso), papéis e permissões, lojas e membros.
- Produtos, variantes, categorias, imagens (Supabase Storage, validação de tipo real), estoque com histórico.
- Catálogos públicos/privados e links exclusivos (token aleatório, expiração, desativação, limite de uso).
- Checkout com recálculo de preço e frete no servidor, baixa de estoque transacional, idempotência, expiração com devolução de estoque.
- Abstração de pagamentos com adaptador Mercado Pago (Checkout Pro, webhook assinado e idempotente, consulta do estado real).
- Financeiro (receitas, despesas, categorias, resumo com critérios documentados, fluxo de caixa) e painel de indicadores.
- OpenAPI/Swagger gerado das mesmas validações, health/ready, logs estruturados, rate limiting, Dockerfile.

Frontend (`palace-grappling-store`):

- Vite + React 19 + TS strict, React Router com todas as rotas da loja e do painel, TanStack Query, RHF + Zod.
- Design tokens provisórios e primitivos acessíveis (botão, campos, alertas, estados, badges).
- Cliente da API com sessão em memória e refresh automático; sessão do painel com troca de loja e menu por permissão.
- Painel: login e painel inicial funcionais contra a API real.
- Loja: rotas com dados, carregamento, erro e vazio; carrinho persistente; regras de seleção obrigatória de variante; schema do checkout.
- Dockerfile com Nginx sem privilégios.

## 7. Comandos executados e resultados

| Comando | Resultado |
| --- | --- |
| `commerce-api`: `npx prisma validate`, `prisma migrate dev` (banco local) | schema válido, migration aplicada |
| `commerce-api`: `npm run db:seed` | loja de demonstração criada |
| `commerce-api`: `tsc --noEmit`, `eslint .` | sem erros |
| `commerce-api`: `npx vitest run` | **58 testes passando** (21 unitários, 37 de integração com PostgreSQL 17 real) |
| `commerce-api`: `npm run build` | `dist/server.js` gerado |
| `commerce-api`: `docker build` + `docker run` com `NODE_ENV=production` | migrations aplicadas no start, `/ready` respondendo |
| `palace-grappling-store`: `tsc --noEmit`, `eslint .` | sem erros |
| `palace-grappling-store`: `npx vitest run` | **14 testes passando** |
| `palace-grappling-store`: `npm run build` | build de produção gerado |
| Navegador (dev, API real) | login, persistência de sessão após recarregar, painel com dados do seed, link exclusivo válido e inválido conferidos |

| `palace-grappling-store`: `docker build` + `docker run` | Nginx servindo a SPA com fallback de rotas (`/admin/login` → 200) |

Não executado: `docker compose --profile full` completo.

## 8. Pendências

- **Imagens de referência** (bloqueia a direção visual definitiva e os layouts da loja).
- Mercado Pago e Supabase Storage não testados contra serviços reais (sem credenciais).
- Itens de roadmap listados nos READMEs (cupons, estorno automático, e-mails, transportadoras, RLS, rate limit distribuído).

## 9. Próxima fase recomendada

Fase 2, identidade visual e loja: com as imagens em mãos, resumir a direção visual, revisar tokens, criar logotipo e monograma, construir a homepage editorial, listagem com filtros, página de produto, carrinho e checkout, e validar mobile, estados de erro, vazio e carregamento.
