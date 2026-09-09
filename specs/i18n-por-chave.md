# Spec — i18n por chave (PT, ES, EN)

**Rodada:** 1 do ciclo de produto · **Data:** 2026-09-09
**Origem:** [ADR-P03](../docs/08_DECISOES/adr-p03-i18n-por-chave.md), primeiro
commit da Fase 1 do `docs/00_VISAO/plano-de-produto.md`.

---

## 1. Escopo

Tirar do código toda string visível ao usuário no **painel** e no **jogo/HUD**,
substituindo por chave resolvida em tempo de execução, com catálogo em PT, ES e
EN vindo de uma fonte única em `data/i18n/`, espelhada por gerador no padrão que
`data/tokens.json` já usa.

## 2. Fora de escopo

Nesta rodada **não** entra:

- **Instalador, e-mails transacionais, landing e checkout.** Não existem ainda.
  Quando existirem, nascem com chave.
- **Console do operador.** PT apenas, nunca traduz (ADR-P05).
- **Mensagens que a PONTE gera e o painel exibe literalmente.** Traduzi-las exige
  a ponte devolver **código de erro** em vez de frase pronta — mudança de
  contrato de API que merece rodada própria. Fica registrado como próximo item.
  Nesta rodada elas continuam como estão, e o teste de string cravada as ignora
  por lista explícita.
- **Nome de presente da TikTok.** Vem da API; o streamer conhece pelo nome
  original (ADR-P03).
- **Gravar o idioma no perfil do Supabase.** É ADR-P02, fase posterior. Aqui o
  idioma mora em `data/configuracao.json`, que é exatamente "o que o streamer
  define no painel e vale entre sessões".
- **Tradução do conteúdo de dado** (nome de preset, de mapa, de look). É texto do
  usuário, não da interface.

## 3. Origem e decisões que este item honra

- **ADR-P03** — a decisão inteira. Inclusive a parte incômoda: o "nasce com
  chave" chegou tarde, então este é o retrofit.
- **ADR-003** — o idioma é dado do streamer, então vai para JSON em disco atrás
  do repositório, nunca lido direto por rota ou componente.
- **ADR-007 / `docs/02_DESIGN_SYSTEM`** — o rótulo de presente do HUD tem no
  máximo 8 caracteres, e os 6 slots ficam lado a lado sem scroll. Tradução que
  estoure isso quebra a tela principal.
- **BUG-001** — campo novo em contrato entre processos só é contrato se um teste
  ler os dois lados. Vale para o `idioma` novo no schema de configuração.
- **`CLAUDE.md`** — CSS separado do JSX; nada de cor literal; `fs` só nos repos;
  nenhuma operação nova no caminho crítico do presente.

## 4. Arquivos afetados

### Novos
| Arquivo | Papel |
|---|---|
| `data/i18n/pt.json`, `es.json`, `en.json` | Fonte única do catálogo, por chave |
| `data/schemas/i18n.schema.json` | Contrato do catálogo |
| `scripts/gerar-i18n.mjs` | Espelha o JSON em painel e Luau, no padrão do `gerar-tokens.mjs` |
| `panel/src/i18n/catalogo.js` | **GERADO.** Não editar à mão |
| `panel/src/i18n/TraducaoProvider.jsx` | Contexto do idioma |
| `panel/src/i18n/useTraducao.js` | O hook `t()` |
| `panel/src/components/SeletorDeIdioma.jsx` + `.css` | Troca manual no painel |
| `game/src/shared/textos.lua` | **GERADO.** Catálogo dos três idiomas para o Luau |
| `test/i18n.test.mjs` | Os testes da seção 5 |

### Modificados
| Arquivo | Mudança |
|---|---|
| `data/schemas/configuracao.schema.json` | Campo `idioma`, enum `pt`/`es`/`en` |
| `data/configuracao.json` | `idioma` gravado |
| `package.json` | `gerar` e `pretest` passam a chamar `gerar-i18n.mjs` |
| ~30 arquivos de `panel/src/` | Retrofit das strings (ver inventário abaixo) |
| HUD em `game/src/` | Passa a ler `textos.lua` |
| `bridge/src/repos/configuracao.mjs` | Aceitar e devolver `idioma` |

### Inventário do retrofit no painel
30 arquivos com string visível, os maiores primeiro: `MonitorAoVivo` (46),
`App` (46), `CartaoDeSlot` (32), `TabelaDeMovimento` (26), `BarraDeSessao` (26),
`PreviaDeMapa` (23), `PainelDeLogs` (19), `TestadorDeAnimacao` (18),
`PainelDeAcervo` (18), `PainelDeOverlay` (17), `lib/regras.js` (15), e mais 19
com 14 ou menos.

## 5. Critérios de aceite

Cada um responde sim/não com evidência no código.

1. `data/i18n/{pt,es,en}.json` existem, validam contra `i18n.schema.json`, e
   **têm exatamente o mesmo conjunto de chaves** — nenhuma sobrando, nenhuma
   faltando em nenhum dos três.
2. Um teste falha quando uma chave existe em um idioma e falta em outro.
3. Um teste falha quando o código referencia uma chave que não está no catálogo.
4. Um teste falha quando aparece string visível cravada em `.jsx` — texto entre
   tags e os atributos `title`, `placeholder`, `aria-label` e `alt` — fora da
   lista explícita de exceções.
5. Toda chave é nomeada em inglês, no formato `<superficie>.<contexto>.<slug>`
   (ex.: `panel.liveMonitor.emptyState`), como manda o ADR-P03.
6. O painel resolve o idioma nesta ordem: `data/configuracao.json`, senão
   `navigator.language`, senão `pt`. A troca manual pelo `SeletorDeIdioma` grava
   em `data/configuracao.json` pelo repositório, nunca por acesso direto a `fs`.
7. `data/schemas/configuracao.schema.json` tem `idioma` com enum
   `["pt","es","en"]`, e um teste lê o campo da FONTE que o painel envia e
   compara com o schema — a lição do BUG-001.
8. `game/src/shared/textos.lua` é gerado, traz os três idiomas, e nenhum arquivo
   Luau de HUD contém string visível literal.
9. **Nenhum rótulo de presente traduzido passa de 8 caracteres** em nenhum dos
   três idiomas, e um teste garante isso — é a regra do `02_DESIGN_SYSTEM`.
10. `npm run gerar` regenera `panel/src/i18n/catalogo.js` e
    `game/src/shared/textos.lua` de forma determinística; rodar duas vezes não
    muda nada.
11. Os arquivos gerados trazem cabeçalho "GERADO por scripts/gerar-i18n.mjs —
    não editar à mão", igual aos de token.
12. **Nada de i18n entra no caminho crítico do evento de presente.** O catálogo
    é resolvido em tempo de import, não por chamada por evento.
13. Data, número e moeda seguem o locale escolhido; **preço sempre exibido em
    USD**, qualquer que seja o idioma.
14. Nenhuma cor, marca ou regra de cliente foi introduzida. CSS do
    `SeletorDeIdioma` fica em arquivo próprio, com tokens do tema.
15. `npm test` verde e `npm run validar` sem erro.
16. Os 451 testes que já existiam continuam passando — nenhuma regressão.

## 6. Edge cases conhecidos

- **Chave faltando em tempo de execução:** `t()` devolve a chave crua em vez de
  quebrar a tela, e avisa no console em desenvolvimento. Tela em branco durante
  a live é pior que texto feio.
- **Interpolação:** `t('chave', { n: 3 })`. Placeholder ausente no catálogo não
  pode lançar exceção.
- **Plural:** só onde já existe no texto atual. Não inventar motor de plural.
- **Configuração legada sem `idioma`:** arquivo antigo sem o campo continua
  válido e cai no padrão `pt`. O campo é opcional no schema.
- **Idioma inválido** vindo do arquivo ou do navegador (`fr`, `pt-BR`, vazio):
  normaliza pelo prefixo (`pt-BR` → `pt`) e, se não bater, cai em `pt`.
- **Acento e caractere especial** no HUD do Roblox: conferir que a fonte usada
  renderiza `ñ`, `¿`, `ç` e `ã`. Se não renderizar, é achado para o
  `memory/learnings.md`, não motivo para não traduzir.
- **Texto mais longo em ES/EN** estourando os 6 slots lado a lado: a grade é
  fixa em `repeat(6, minmax(0, 1fr))` e os cartões comprimem. Tradução longa
  precisa caber comprimida, não reflui a linha.

## 7. Definição de "aprovado sem ressalvas"

Todos os 16 critérios de aceite em sim, `npm test` verde, `npm run validar` sem
erro, sem `TODO` pendente, sem `console.log` esquecido, e sem regressão nos
fluxos existentes.
