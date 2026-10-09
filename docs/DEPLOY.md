# Deploy: loja na Vercel, API no Render

A **loja** é estática (Vite), então vai para a **Vercel**. A **API** é um servidor Express contínuo, com varredura de pedidos a cada minuto e dependência nativa (Argon2), então vai para um serviço de containers. O exemplo usa o **Render** e o `Dockerfile` do projeto.

A Vercel encaminha `/api/*` para a API (`palace-grappling-store/vercel.json`). Para o navegador, loja e API ficam na mesma origem: o cookie de sessão funciona sem CORS e sem cookie de terceiros.

## 1. API no Render

1. Em render.com, escolha **New → Blueprint** e selecione o repositório. O `render.yaml` cria o serviço `palace-commerce-api` (Docker, pasta `commerce-api`).
2. Preencha as variáveis marcadas como `sync: false`:
   - **`DATABASE_URL`:** no Supabase, vá em **Connect → Transaction pooler** (porta 6543) e acrescente `?uselibpqcompat=true&sslmode=require`. A senha precisa ser codificada para URL (`@` vira `%40`).
   - **`DIRECT_URL`:** no Supabase, **Connect → Session pooler** (porta 5432), com os mesmos parâmetros. O endereço direto `db.<ref>.supabase.co` é só IPv6 e o Render não alcança.
   - **`CORS_ORIGINS` e `STOREFRONT_URL`:** a URL da loja na Vercel.
   - **`PUBLIC_API_URL`:** a URL do serviço no Render.
   - **`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`:** as do Supabase.
   - **Mercado Pago:** quando houver credenciais.
3. O container aplica as migrations no start (`prisma migrate deploy`). Para conferir, abra `https://<serviço>.onrender.com/ready`.

No plano gratuito, o Render hiberna o serviço depois de 15 minutos sem acesso. A primeira requisição seguinte demora cerca de 1 minuto, e a varredura de pedidos vencidos só roda com o serviço acordado.

## 2. Loja na Vercel

1. Em **Add New → Project**, importe o repositório e defina **Root Directory = `palace-grappling-store`**. Não use `commerce-api`: a API não roda como projeto estático na Vercel.
2. O framework (Vite), o comando de build e a pasta `dist` já vêm do `vercel.json`.
3. Não defina `VITE_API_URL`. Vazio significa mesma origem, via o proxy `/api`.
4. Se o serviço do Render tiver outro nome, ajuste o destino da primeira regra em `vercel.json`.

## 3. Depois do primeiro deploy

- Troque a senha do banco e a chave secreta do Supabase, que foram compartilhadas no chat, e atualize as variáveis no Render.
- Entre em `/admin/login` com o usuário do seed e troque a senha temporária.
- Mercado Pago: configure o webhook para `https://<serviço>.onrender.com/api/v1/webhooks/payments/mercadopago`.
