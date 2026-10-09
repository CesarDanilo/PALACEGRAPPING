# Auditoria antes das correções (adendo de UX, segurança e testes)

Data: 2026-10-09.

## O que foi verificado

- Leitura do código dos dois repositórios: rotas, schemas, middlewares, formulários e testes.
- `npm audit` nos dois projetos.
- Busca por segredos no bundle de produção da loja.
- Inspeção automatizada com Playwright a 320 px: overflow horizontal e áreas de toque nas rotas da loja e do painel, com dados reais do Supabase.

Legenda:
- **[C] Confirmado:** reproduzido ou visto no código.
- **[R] Risco potencial:** depende de configuração ou de abuso.
- **[N] Não implementado:** funcionalidade que ainda não existe.

## Crítico

Nenhum problema crítico encontrado. Não há injeção de SQL (Prisma e SQL bruto só com template parametrizado), nem acesso cruzado entre lojas: os testes de integração existentes cobrem isso. Também não há segredos no bundle da loja (busca por `sb_secret`, `service_role`, `MERCADOPAGO` e `JWT_ACCESS` em `dist/`: nenhum resultado).

## Alto

1. **[N] Troca de senha.** Não existe endpoint nem tela de troca de senha. O administrador do seed fica com a senha temporária para sempre.
2. **[C] Mobile a 320 px.**
   - Os ícones do cabeçalho da loja estouram a largura (`scrollWidth` 341 px em todas as páginas).
   - O banner de categoria chega a 556 px.
   - O breadcrumb e a galeria do produto passam da tela.
   - A tabela de variantes do novo produto no painel chega a 1043 px.
3. **[C] Painel sem navegação móvel.** O menu lateral vira um bloco fixo no topo, sem abrir e fechar.
4. **[C] Dependências do backend.** `npm audit`: 4 vulnerabilidades altas, transitivas do CLI do Prisma (`deepmerge-ts`, e `mysql2`, que o projeto não usa).
5. **[C] Rate limit incompleto.**
   - Não há políticas próprias para busca e catálogo públicos, uploads, geração de links e rotas administrativas sensíveis.
   - Os limites não são configuráveis por variável, exceto o de login.
   - O armazenamento é só em memória, sem opção de Redis.
6. **[C] Uploads.**
   - Metadados (EXIF/GPS) não são removidos.
   - A imagem não é reprocessada.
   - Não há limite de fotos por produto.

## Médio

7. **[C] Propriedades extras são descartadas em silêncio** (o padrão do Zod é remover chaves desconhecidas). O adendo exige rejeitá-las.
8. **[R] CSRF nas rotas com cookie** (`/auth/refresh` e `/auth/logout`). Com `SameSite=Lax` o risco é baixo, mas a configuração permite `none` e não há verificação de `Origin`.
9. **[C] Validações frouxas.**
   - Telefone aceita qualquer sequência de 10 a 13 dígitos e não confere o DDD.
   - UF aceita quaisquer 2 letras.
   - Não há limite de unidades por pedido, só de itens.
   - O nome do checkout não exige sobrenome.
   - SKU sem padrão de caracteres.
10. **[C] Formulários do painel sem Zod:** variantes, movimentações, despesas e receitas, catálogos, links e configurações. A validação depende do HTML e da API.
11. **[C] Imagens pesadas.**
    - O hero e a página Sobre usam PNG de cerca de 740 KB.
    - A imagem principal não tem `fetchpriority`.
    - As fotos de produto não são redimensionadas no envio.
12. **[N] Política de segurança de conteúdo (CSP) da loja:** não está definida no `vercel.json` nem no `nginx.conf`.

## Baixo

13. **[C] Áreas de toque menores que 24 px** em links de texto e controles (11 a 21 por página).
14. **[R] Webhook do Mercado Pago sem janela de tempo** contra replay. A idempotência por evento já impede efeito duplicado.
15. **[R] Consulta pública de pedido** (`GET /public/orders/:number`) só tem o limite geral da API.

## Plano

Corrigir 1 a 13, deixar 14 configurável e cobrir 15 com uma política própria. Cada correção vem com testes. O relatório final separa o que foi build, teste automatizado, auditoria estática e teste de segurança.
