# DESIGN.md: Palace Grappling

Sistema visual da loja e do painel. A origem da direção está em [`../docs/DIRECAO-VISUAL.md`](../docs/DIRECAO-VISUAL.md). Os valores vivem em `src/styles/tokens.css` e nenhum componente usa cor, fonte ou espaçamento literal.

## Mundo visual

"Tatame à noite". A base é preto profundo e as fotos são dessaturadas. As seções de manifesto e lançamento usam papel off-white. O verde-limão aparece pouco e sempre com função.

| Superfície | Modo | Tratamento |
| --- | --- | --- |
| Loja | Persuasão | Cantos retos, tipografia display condensada, composições assimétricas, fotos grandes, sem cards arredondados nem sombras genéricas. |
| Painel | Operação | Superfícies grafite, raio de 12px em painéis e 6px em controles, Inter, números tabulares, indicadores em uma régua única. |

## Cor

| Token | Uso |
| --- | --- |
| `--surface-page` `#070707` | fundo dominante |
| `--surface-raised` / `--surface-control` | painéis, campos, cards de produto |
| `--surface-paper` `#ecebe6` | manifesto, campanha, mosaico de coleções |
| `--text-primary` / `--text-secondary` / `--text-muted` | hierarquia de texto (contraste ≥ 4.5:1 para texto corrido sobre o preto) |
| `--accent` `#c6ff1a` | CTA principal, "+" de compra rápida, ponto final dos títulos, preço promocional, foco, seleção de texto |
| `--color-success/warning/danger/info` | estados de pedido, pagamento e formulários |

Regras:
- O limão nunca preenche áreas grandes; o máximo é um botão.
- Sobre o papel, o CTA é preto, não limão.
- Alertas usam uma borda fina na cor do estado. Não há faixa colorida lateral.

## Tipografia

| Papel | Fonte | Notas |
| --- | --- | --- |
| Display | Barlow Condensed 800, caixa alta | `--display-sm` a `--display-xl` (máx. 6rem), entrelinha 0.86 a 1.02, tracking −0.01em |
| Texto e preços | Inter Variable | corpo 1rem / 1.55; preços com números tabulares |
| Rótulos | Inter semibold, caixa alta, tracking 0.12em (`.label`) | legendas de filtro, títulos de rodapé, metadados. É o próprio título do bloco, nunca um sobretítulo. |
| Dados | IBM Plex Mono (`.mono`) | SKU, número de pedido, código de rastreio. Só para dados. |

O ponto final em limão (`.dot`) é a assinatura dos títulos de impacto.

## Marca

- **Logotipo:** monograma e "PALACE" em display, com "GRAPPLING" em tracking largo (`src/brand/Brand.tsx`).
- **Monograma:** um "P" chanfrado sobre uma faixa de Jiu-Jitsu. A ponteira em limão traz 4 graus.
- **Grafismos:** `BeltBar` (faixa com graus, usada como divisor), `CircleBadge` (selo com texto em volta, parado com `prefers-reduced-motion`) e `Slashes` (`/////`).

## Espaço e layout

- Escala de 4px (`--space-1` a `--space-24`), gutter fluido `--gutter`, conteúdo máximo de 1440px.
- Breakpoints de referência: 480, 768, 1024 e 1440.
- Grade de produtos: 2 colunas no mobile e 4 a partir de 1024.
- Itens de grid com rolagem interna levam `min-width: 0`, para nunca alargar a página.

## Componentes

| Componente | Arquivo |
| --- | --- |
| Botão (`primary`, `secondary`, `ghost`, `danger`) | `src/components/ui/Button.tsx` |
| Campos com label, erro e `aria-invalid` | `src/components/ui/Field.tsx` |
| Alertas, estados e badge de disponibilidade | `src/components/ui/Feedback.tsx` |
| Toast (região `aria-live`) | `src/components/ui/Toast.tsx` |
| Card e grade de produto, preço | `src/components/store/ProductCard.tsx`, `Price.tsx` |
| Listagem com filtros na URL | `src/components/store/ProductListing.tsx` |
| Seções, benefícios, contagem regressiva | `src/components/store/Sections.tsx` |
| Mídia e ilustrações temporárias | `src/components/media/` e `src/content/media.ts` |

## Interação e acessibilidade

- Foco visível em todos os elementos: anel limão com 2px de afastamento.
- Também levam o tema: seleção de texto, cursor, barra de rolagem, sublinhado e números tabulares.
- O link "pular para o conteúdo" existe nos dois layouts.
- Grupos de tamanho e cor usam `radiogroup`.
- O guia de tamanhos abre como disclosure (`<details>`), não como modal.
- Movimento só onde tem função (selo circular, shimmer de carregamento), sempre desativado com `prefers-reduced-motion`.

## Imagens

- As fotos de produto vêm da API, com o texto alternativo cadastrado no painel.
- As fotos editoriais ficam em `src/content/media.ts`. Enquanto `src` for `null`, a loja mostra ilustrações geométricas com o selo "Foto temporária" e o briefing da foto que deve substituí-las.
