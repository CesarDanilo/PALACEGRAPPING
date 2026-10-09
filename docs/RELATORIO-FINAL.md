# Relatório final: fases 2 a 5 e polimento

Data: 2026-10-08. A fase 1 está registrada em [FASE-1.md](FASE-1.md) e a direção visual em [DIRECAO-VISUAL.md](DIRECAO-VISUAL.md).

## O que foi entregue

### Fase 2: identidade visual e loja

- Análise das três referências e a direção "tatame à noite" (preto, papel off-white e limão como acento).
- Logotipo e monograma originais: um "P" chanfrado sobre a faixa de Jiu-Jitsu com 4 graus. Também foram criados a faixa como divisor, o selo circular e o grafismo `/////`.
- Homepage editorial com:
  - hero e mini-card do último lançamento;
  - faixa de benefícios e lançamentos;
  - linhas Gi/No-Gi e categorias com colagem;
  - campanha com contagem regressiva real (usa a data de fim do catálogo);
  - destaques, manifesto e inspiração.
- Listagem `/loja` com busca, filtros na URL (linha, categoria, tamanho, cor, disponibilidade), ordenação e paginação.
- Página de produto:
  - galeria, variantes com tamanho e cor obrigatórios e tamanhos esgotados indicados;
  - quantidade e guia de tamanhos;
  - entrega, produtos relacionados e CTA fixo no mobile.
- Carrinho cotado no servidor e checkout com validação, termos, Pix ou cartão, `expectedTotal` e idempotência.
- Retorno do pagamento, acompanhamento de pedido, "meus pedidos", coleções, links exclusivos, sobre, contato, políticas e 404.
- Ilustrações temporárias identificadas, centralizadas em `src/content/media.ts`.

### Fase 3: produtos e administração

- Produtos: lista, criação com variantes e estoque inicial, edição, desativação, variantes e fotos (upload, alt, ordem, principal).
- Categorias, estoque (movimentações e histórico), catálogos (período e produtos) e links exclusivos (expiração, limite, ativação, cópia).

### Fase 4: checkout e operação

- Pedidos (filtros, detalhe, próximas ações, envio e rastreio, cancelamento e devolução) e clientes.
- Financeiro (resumo mensal, receitas, despesas, relatório anual) e configurações comerciais.
- API: `/public/catalogs` e `/public/facets`.

### Fase 5: qualidade e entrega

- **E2E Playwright em desktop e mobile:** compra completa, link inválido e painel.
- **Bugs reais encontrados pelos testes e corrigidos:**
  - o redirecionamento depois do pedido levava ao carrinho vazio;
  - o retorno ao login perdia a página de destino;
  - duas abas renovando a sessão derrubavam o usuário (resolvido com uma tolerância de 20 s);
  - o limite de taxa compartilhado entre login e renovação de sessão era apertado demais;
  - o container de produção quebrava (dependência de dev no logger e colisão de nomes no bundle).
- **Code splitting:** o painel e o checkout carregam sob demanda, e o bundle principal caiu de 560 KB para 428 KB.

### Polimento com a skill impeccable

Apliquei os guias `craft-floor` e `polish` da skill. O carregador de contexto dela baixa e executa um binário externo, e a instalação mostrou um alerta de segurança, por isso ele não foi executado.

- Removidos os sobretítulos acima dos títulos e as numerações decorativas.
- Fonte mono restrita a dados (SKU, número de pedido).
- Removidas as faixas coloridas laterais em alertas e cards, o blur decorativo do cabeçalho e o granulado das ilustrações.
- Títulos display limitados a 6rem e indicadores do painel reunidos em uma régua única.
- O guia de tamanhos virou disclosure em vez de modal.
- Seleção de texto, cursor, barra de rolagem e sublinhado agora seguem a marca.
- Corrigidos: a sobreposição no manifesto, o CTA quebrando em duas linhas no mobile e o texto do selo circular.
- Criado o `DESIGN.md` da loja.

## Comandos executados e resultados

| Comando | Resultado |
| --- | --- |
| `commerce-api`: `tsc --noEmit`, `eslint .` | sem erros |
| `commerce-api`: `vitest run` | **59 testes passando** (unitários + integração com PostgreSQL 17) |
| `commerce-api`: `npm run build`, `docker build` | ok |
| `palace-grappling-store`: `tsc --noEmit`, `eslint .` | sem erros |
| `palace-grappling-store`: `vitest run` (3 execuções seguidas) | **20 testes passando** |
| `palace-grappling-store`: `playwright test` contra o dev server | **6 testes passando** |
| `docker compose --profile full up --build` + `playwright test` com `E2E_BASE_URL=http://localhost:8090` | **6 testes passando** contra as imagens de produção |
| Inspeção visual (Playwright, 1440 e 390 px) | sem overflow horizontal; achados corrigidos |

## Pendências

- **Integrações sem credenciais:** Mercado Pago e Supabase Storage não foram testados contra os serviços reais. O passo a passo de sandbox está no README da API.
- **Fotos oficiais:** a loja usa ilustrações temporárias até as fotos chegarem. Veja "Trocar as imagens temporárias" no README da loja.
- **Políticas:** o texto é modelo e precisa de revisão jurídica.
- **Roadmap:**
  - cupons;
  - estorno automático;
  - e-mails transacionais;
  - transportadoras;
  - RLS no Postgres;
  - rate limit distribuído;
  - conta de cliente;
  - newsletter;
  - convites de equipe pelo painel.
