# ADR-P03 — i18n por chave, e o funil só em inglês na Fase 1

**Status**: Aceito · **Data**: 2026-09-09 · **Decisores**: Matheus Bonato

---

## Contexto

O produto é vendido para streamers de língua inglesa, e o dono quer português,
espanhol e inglês. O plano diz, com razão, que retrofit de string em código
pronto custa várias vezes mais que nascer com chave.

**Só que o código já está pronto.** Levantamento de 2026-09-09 no repositório:

| Superfície | Tamanho | Estado |
|---|---|---|
| Painel React | 28 componentes, ~570 strings visíveis em português | Tudo cravado no JSX |
| Jogo e HUD em Luau | 53 arquivos, ~1.350 literais (parte é chave interna, a triar) | Tudo cravado |
| Ponte | mensagens de erro de rota e de conector | Tudo cravado |

Então a frase do plano — *"i18n entra na arquitetura no primeiro commit da Fase
1, nunca depois"* — só pode significar uma coisa aqui: **o primeiro commit da
Fase 1 é o retrofit.** Não existe versão dessa história em que a dívida não é
paga. Ela é paga agora, quando são 570 strings, ou na semana 8, quando forem
1.200 e houver cliente em cima.

---

## Decisão

**Toda string visível ao usuário sai do código e vira chave, em PT, ES e EN,
como primeira tarefa da Fase 1 — antes de qualquer feature nova da fase.**

E o padrão de arquivo já existe no projeto: `data/tokens.json` é fonte única,
espelhada em `panel/src/styles/tokens.css` e `game/src/shared/tokens.lua` por
`npm run gerar`. **A i18n segue exatamente o mesmo caminho**, porque o problema
é o mesmo — um dado que precisa aparecer igual em três superfícies escritas em
duas linguagens.

```
data/i18n/{pt,es,en}.json   → fonte única
      ↓  npm run gerar
panel/src/i18n/*.js          (painel React)
game/src/shared/textos.lua   (HUD do jogo)
bridge/                      (lê o JSON direto, é Node)
```

### O que traduz e o que não traduz

| Superfície | Idiomas | Quando |
|---|---|---|
| Painel do cliente | PT, ES, EN | Fase 1, primeiro commit |
| Texto em tela do jogo e do overlay | PT, ES, EN | Fase 1 |
| Mensagem de erro e de instalação | PT, ES, EN | Fase 1 |
| E-mail transacional e entrega de licença | PT, ES, EN | Fase 1 |
| Landing, checkout, material de venda | **EN primeiro** | ES e PT só na Fase 2 |
| Console do operador | **PT apenas, nunca traduz** | usuário único, é a Kora |
| Nome de presente da TikTok | **não traduz** | vem da API; o streamer conhece pelo nome original |

### Regras técnicas

- Zero string escrita direta em componente, ModuleScript ou rota.
- Idioma detectado pelo locale do sistema, com troca manual no painel.
- Data, número e moeda seguem o locale. **Preço sempre exibido em USD**,
  qualquer que seja o idioma.
- O idioma escolhido é gravado no perfil (Supabase, ADR-P02) e aparece na ficha
  do assinante no console.
- Chave nomeada por lugar e função, em inglês, como todo padrão técnico do
  projeto: `panel.slots.emptyLabel`, não `slot_vazio_1`.

---

## Alternativas consideradas

### 1. Traduzir só o painel agora, jogo e e-mails depois
- **Descartado porque**: é a mesma dívida partida em duas, e a metade adiada é
  a que mais aparece na tela do espectador. O HUD é o que o público lê.

### 2. Tradução automática em tempo de execução
- **Descartado porque**: o HUD tem rótulo de no máximo 8 caracteres
  (`docs/02_DESIGN_SYSTEM`). Tradução automática estoura layout, e layout
  estourado no HUD aparece na live de todo mundo.

### 3. Funil de venda nas três línguas já na Fase 1
- **Descartado porque**: é a parte cara. Landing, anúncio, conteúdo diário,
  suporte e afiliado em três línguas é ~3× o trabalho da parte difícil, que é
  distribuição. E há um dado a levantar antes: o valor por presente em BR e
  LatAm é menor, e o comprador local paga em USD com fricção de câmbio. Medir
  de onde vêm os clientes na Fase 1 e decidir na Fase 2, com dado.

---

## Consequências

### Positivas
- O produto nasce vendável em três mercados sem tocar em componente de novo.
- White-label da Fase 3 fica mais perto: quem tira string do código também tira
  marca do código.
- O retrofit é um commit mecânico e verificável — dá para escrever um teste que
  falha se aparecer string nova cravada no JSX.

### Negativas / trade-offs
- **Custa o primeiro commit inteiro da Fase 1**, e não entrega nada visível ao
  cliente. É a tarefa mais fácil de adiar e a mais cara de adiar.
- Três arquivos de tradução para manter sincronizados. Mitigação: teste que
  falha quando uma chave existe em um idioma e falta em outro — mesma ideia do
  teste de contrato que pegou o BUG-001.
- ES e EN precisam de revisão humana. Tradução de software feita por quem não
  fala a língua envelheceu mal em produto de todo mundo que já tentou.

---

## Referências
- [ADR-P02](./adr-p02-supabase-fonte-da-verdade.md) — onde o idioma do perfil vive
- `docs/02_DESIGN_SYSTEM/README.md` — o limite de 8 caracteres do rótulo do HUD
- `data/tokens.json` e `scripts/gerar-tokens.mjs` — o padrão de fonte única espelhada
