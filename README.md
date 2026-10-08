# PALACE

Dois sistemas independentes, lado a lado:

| Projeto | O que é | Porta (dev) |
| --- | --- | --- |
| [`commerce-api/`](commerce-api/README.md) | API comercial genérica e multi-tenant (Node, Express, Prisma, PostgreSQL/Supabase). Não conhece nenhuma marca. | 3350 |
| [`palace-grappling-store/`](palace-grappling-store/README.md) | Loja e painel administrativo da Palace Grappling (React, Vite). Fala com a API só por HTTP. | 5190 |

Cada projeto tem seu próprio `package.json`, lockfile, `tsconfig`, `Dockerfile`, `.env.example`, README e testes, e pode ser construído e publicado separadamente. Nenhum importa arquivos do outro.

## Rodar tudo localmente

```bash
docker compose up -d postgres                 # Postgres de desenvolvimento em localhost:5452

cd commerce-api
npm install && cp .env.example .env           # gere um JWT_ACCESS_SECRET próprio
npm run db:deploy
SEED_ADMIN_PASSWORD='troque-esta-senha' npm run db:seed
npm run dev

cd ../palace-grappling-store                  # em outro terminal
npm install && cp .env.example .env
npm run dev                                   # http://localhost:5190 e /admin/login
```

Tudo em containers (API + loja + banco): `docker compose --profile full up -d --build` (loja em `http://localhost:8090`, API em `http://localhost:3350`). Em produção o banco é o Supabase; o Postgres do compose existe só para desenvolvimento e testes.

## Documentação

- [docs/FASE-1.md](docs/FASE-1.md): direção proposta, arquitetura, multi-tenancy, o que foi entregue, comandos executados, resultados e próxima fase.
- READMEs de cada projeto: instalação, variáveis, rotas/endpoints, segurança, testes, Docker, deploy, limitações.
