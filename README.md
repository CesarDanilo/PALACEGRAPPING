# PALACE GRAPPLING: loja e painel

Este repositório contém o **frontend** da Palace Grappling: a loja e o painel administrativo, em [`palace-grappling-store/`](palace-grappling-store/README.md) (React, Vite).

O **backend** (`commerce-api`) vive num repositório próprio: uma API comercial genérica e multi-tenant em Node, Express, Prisma e PostgreSQL/Supabase. A loja fala com ela apenas por HTTP, em `/api/v1`.

## Rodar localmente

Com a API rodando em `http://localhost:3350` (veja o README do backend):

```bash
cd palace-grappling-store
npm install && cp .env.example .env
npm run dev          # http://localhost:5190 e /admin/login
```

Em desenvolvimento, o Vite encaminha `/api` para a API. Em produção (Vercel), quem faz esse encaminhamento é o `palace-grappling-store/vercel.json`.

## Deploy na Vercel

1. Importe este repositório com **Root Directory = `palace-grappling-store`**.
2. O framework, o build e a pasta de saída já vêm do `vercel.json`.
3. Não é preciso definir variáveis: `/api/*` é encaminhado para a API no Render (ajuste o destino no `vercel.json` se o serviço tiver outro endereço).

## Documentação

- [palace-grappling-store/README.md](palace-grappling-store/README.md): rotas, componentes, integração com a API, testes, Docker.
- [palace-grappling-store/DESIGN.md](palace-grappling-store/DESIGN.md): sistema visual.
- [docs/DIRECAO-VISUAL.md](docs/DIRECAO-VISUAL.md): análise das referências e identidade da marca.
- [docs/RELATORIO-FINAL.md](docs/RELATORIO-FINAL.md) e [docs/FASE-1.md](docs/FASE-1.md): histórico do que foi entregue.
- [docs/DEPLOY.md](docs/DEPLOY.md): deploy completo (loja na Vercel, API no Render).
