# Roteiro da primeira sessão no Roblox Studio

Três itens da Fase 0 esperam a mesma coisa: alguém abrir o Studio. Este roteiro
resolve os três numa sentada — **F0-2** (a torre sobe?), **F0-7** (o Studio
alcança `127.0.0.1`?) e **F0-4** (qual é o teto do long-poll?).

Tempo estimado: **uma hora**, sendo a maior parte olhando a torre.

> Faça na ordem. Os passos 1 a 3 preparam; do 4 em diante você está medindo, e
> cada resposta tem um lugar para ser anotada. **Resposta não anotada é sessão
> perdida** — foi o que aconteceu com o acervo, que ficou meses listado como
> bloqueador depois de pronto.

---

## Antes de abrir qualquer coisa

### 1. A vistoria

```bash
npm run vistoria
```

Ela confere Studio, Rojo, se o place monta de verdade, se a ponte responde e se
o acervo está pronto. **Só siga com tudo em `✓`.** O que vier com `!` não impede
abrir o Studio, mas impede o jogo reagir a presente — resolva antes, é rápido.

### 2. A ponte

```bash
npm run ponte
```

Deixe rodando numa aba própria. É o log dela que você vai ler no passo 6.

### 3. O painel

```bash
npm run painel
```

Página **Jogo** → **Abrir o jogo no Studio**. O botão monta o place com o
`KoraConfig` e o `HttpService` já configurados, e abre o Studio nele. Sobra dar
Play.

---

## A sessão

### 4. F0-2 — a torre sobe?

Dê **Play**. O que precisa acontecer, em ordem:

- [ ] O mundo constrói: torre de plataformas, céu, texturas
- [ ] O boneco nasce no pé da torre
- [ ] Você consegue subir pulando, **sem presente nenhum** (ADR-009)
- [ ] O contador embaixo da barra da torre acompanha a subida
- [ ] Cair não tira progresso: você volta ao checkpoint (ADR-008, R10)

Depois, no painel, página **Ao vivo** → **Testar presente**:

- [ ] O boneco reage, e a animação é a do slot
- [ ] Um presente de descida desce a torre
- [ ] Nenhum travamento: o boneco nunca fica ancorado (R11, watchdog do ADR-005)

**Onde anotar:** se algo aqui falhar, é bug de verdade — abra em
`memory/bugs.md` com sintoma, reprodução e causa, no formato dos BUG-001 a 007.

### 5. F0-7 — o Studio alcança `127.0.0.1`?

Sem fechar o Studio, em outra aba do terminal:

```bash
npm run sondar
```

Cole o Luau que ele imprimir na **barra de comandos do Studio**
(View → Command Bar) e aperte Enter. Leia o Output.

Lembre da regra que a sonda aplica: **um `401` é resposta POSITIVA.** Para tomar
401 o pacote precisou chegar na ponte.

**Onde anotar, nos dois lugares:**
- `memory/learnings.md` — o resultado e o que ele decide
- `docs/09_BACKLOG/fase-0-fixes-minimos.md`, item F0-7 — trocando o título por
  SIM ou NÃO

Se for **SIM**, o ADR-002 reabre para tirar o Cloudflare Tunnel do caminho, e o
instalador do ADR-P04 perde o passo mais frágil.

### 6. F0-4 — qual é o teto do long-poll?

Este não exige nada de você além de **deixar a sessão parada uns minutos**, sem
disparar presente, olhando o Output do Studio.

Se o Roblox fechar o long-poll antes dos 20s da ponte, aparece **uma vez**:

> `[Ponte] F0-4: o Roblox fecha o long-poll em ~Xs, antes dos 20s da ponte.`

Esse `X` é a resposta.

**Se o aviso NÃO aparecer** depois de vários minutos parados, a resposta também
é válida e vale a pena anotar: o Roblox aguenta os 20s, e o chute inicial do
ADR-002 estava certo.

**Onde anotar:** `memory/learnings.md` e o item F0-4.

### 7. F0-6 — de brinde, se sobrar fôlego

Com tudo de pé, deixe rodando **30 minutos** com presente de fixture chegando
(painel → modo de teste, sem live). É o ensaio geral: rate limit, vazamento de
memória e long-poll órfão só aparecem no tempo. Foi assim que o BUG-002
apareceu.

---

## Depois da sessão

```bash
npm test && npm run validar
```

E atualize o `specs/_loop.md` com o que a sessão respondeu. As três respostas
destravam, juntas, a decisão de túnel do ADR-002 e o resto da Fase 0.
