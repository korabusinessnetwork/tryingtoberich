# Padrões — Kora Stream Games

## Padrão: caminho crítico versus caminho frio
Todo evento que chega da TikTok segue dois caminhos a partir da ponte:
- **Quente (bloqueante, alvo <50ms no Node):** normalizar evento → casar com slot
  → responder o long-poll pendente.
- **Frio (fire-and-forget):** gravar no log da sessão, atualizar contador do
  painel, calcular estatística.
Nunca mover coisa do frio para o quente. Ver `CLAUDE.md`, Princípio nº1.

## Padrão: repositório para arquivo JSON
Nenhum `fs.readFile` fora de `bridge/src/repos/`. Cada repositório expõe verbos
de domínio (`carregarPreset`, `salvarPreset`), nunca caminho de arquivo. Isso é
o que permite trocar JSON por banco na Fase 3 mexendo em um diretório só.
Ver ADR-003.

## Padrão: uma animação, um módulo
Cada uma das 20 animações é um ModuleScript isolado em `game/src/animacoes/`,
com a mesma assinatura `executar(personagem, contexto)` e a mesma ficha de
metadados. Nenhuma animação conhece a existência de outra. Adicionar a 21ª é
criar um arquivo e registrar no índice, nada mais.

## Padrão: o painel manda spec, o jogo interpreta
A ponte nunca envia comando visual detalhado para o Roblox. Ela envia
`{slotId, animacaoId, delta, intensidade}`. Toda decisão de como aquilo aparece
na tela vive no Luau. Isso mantém a ponte agnóstica de jogo e permite a Fase 2
reusar a ponte inteira em outra modalidade.

## Padrão: valor sugere, usuário decide
Onde o valor em moedas do presente aparecer, ele é ordenação, cor de destaque ou
aviso. Nunca é regra de negócio. O vínculo presente→animação é sempre escolha
explícita do streamer. Ver ADR-007.

## Padrão: nomes
- Domínio em português: `preset`, `slot`, `presente`, `animacao`, `escalada`.
- Técnico em inglês: `handleGiftEvent`, `useLongPoll`, `retryWithBackoff`.

## Padrão: o jogo é dono da posição, a ponte é dona do delta
A ponte nunca sabe em que plataforma o boneco está e nunca acumula posição. Ela
envia `delta`. O Roblox aplica sobre a `plataformaReferencia` que só ele conhece,
porque só ele vê o streamer jogando. Se a ponte precisar da posição para exibir
no painel, ela recebe do jogo via `POST /jogo/estado`. Ver R9.

## Padrão: toda tomada de controle tem watchdog
Qualquer código que ancore o personagem, desabilite input ou assuma o movimento
arma um timer independente que força a restauração. Sem exceção. Personagem
ancorado por bug é live morta. Ver ADR-005 e R11.

---

## i18n por chave (ADR-P03, desde 2026-09-09)

### A fonte é uma só, e o gerador espelha
`data/i18n/{pt,es,en}.json` → `npm run gerar` → `panel/src/i18n/catalogo.js` e
`game/src/shared/textos.lua`. **Mesmo desenho de `data/tokens.json`**, e pelo
mesmo motivo: o mesmo dado precisa existir em três superfícies escritas em duas
linguagens. Nunca editar os dois arquivos gerados — eles avisam no cabeçalho, e
um teste compara o disco com a fonte.

### Como se escreve texto novo
```jsx
const { t } = useTraducao();
t("panel.liveMonitor.title")
t("panel.slotCard.coinsMany", { n: 6 })
```
Fora de componente (`panel/src/lib/`), `traduzir` de `../i18n/traduzir.js`.
No Luau, `Textos.t("game.wardrobe.title", { n = 3 })`.
No overlay servido pela ponte, `T["hud.overlay.tie"]`.

- Chave é `<superficie>.<contexto>.<slug>`, **em inglês**, 3 segmentos.
  `panel`, `game`, `hud` ou `common`. O schema recusa outro formato.
- Valor no meio da frase vira `{nome}`, nunca concatenação de `t()` com pedaço.
- Guardar a CHAVE em tabela de lookup e resolver na hora de desenhar é o padrão
  certo, não uma sobra.

### Número, data e hora
**Nunca** `toLocaleString("pt-BR")`. Sempre `panel/src/i18n/formatar.js`
(`numero`, `data`, `dataHora`, `hora`, `moedaUsd`). Preço é a exceção que
manda: sempre USD, em qualquer idioma. No Luau, o separador de milhar sai de
`SEPARADOR[Textos.idioma()]`. Um teste barra locale cravado fora do formatador.

### O que NÃO se traduz
Nome de presente da TikTok (vem da API), texto do próprio streamer (nome de
preset, mapa, look, nick), identificador, nome de instância do Roblox, chave de
tabela, caminho, emoji, atalho de tecla, e o **console do operador**, que é PT
sempre (ADR-P05).

### Onde mora o idioma
`data/configuracao.json`, campo `idioma`, atrás do repositório. Rota própria
`PUT /api/idioma` — **não** um campo do PUT genérico de configuração, porque a
gravação é parcial por campo e um PUT genérico faria trocar de idioma apagar a
conta da live.

---

## Teste que abre sessão apaga o arquivo (desde 2026-09-09)

`encerrarSessao()` **grava** em `data/sessoes/`, que é o histórico de lives que
o painel mostra ao dono na página Histórico. Todo teste que abre uma sessão de
verdade — e vários abrem, porque é assim que se exercita o start — precisa
apagar o arquivo que ela deixou:

```js
const resumo = await nucleo.encerrarSessao();
if (resumo?.sessaoId) await apagar(caminhoDeDados("sessoes", `${resumo.sessaoId}.json`));
```

Vale para `afterEach` também: fechar a sessão por segurança grava do mesmo jeito.

**Por que a regra existe:** três vazamentos ao mesmo tempo — a maratona, o
`afterEach` da correção do flake, e um anterior a eles em
`painel-novo.test.mjs`. Resultado: **um arquivo por `npm test`**, e 188 sessões
falsas acumuladas até 2026-09-10, contra 15 reais. O painel mostrava tudo
misturado, e distinguir exigia abrir os JSON um a um.

**Como reconhecer artefato de teste**, se acontecer de novo: sessão de 0
segundos, 1 presente e `plataformaMaxima: 0` é o teste do painel; `presetId`
começando com `teste-` é teste por definição. **Sessão real tem a torre
andando** — foi por `plataformaMaxima > 0` que as 15 verdadeiras foram
preservadas.
