# 09 — Backlog

Ordem pensada para o Claude Code. Cada bloco é entregável e testável sozinho.
Os três diretórios (`bridge/`, `panel/`, `game/`) têm dono exclusivo e podem ser
construídos em paralelo depois do bloco 0.

## Bloco 0 — Contratos (bloqueante, faz primeiro, sequencial) — **concluído**
- [x] `data/schemas/*.schema.json` — 11 schemas: preset, mapa, look, acervo,
      catálogo, animação, sessão, evento normalizado, resposta de long-poll,
      estado do jogo e os tipos comuns
- [x] `data/acervo.json` com a estrutura do acervo — 6 skybox, 6 texturas e 5
      props, todos `pendente-upload` até serem enviados e aprovados (ADR-004)
- [x] `data/catalogo-presentes.seed.json` com a semente de desenvolvimento,
      marcada `confirmado: false` e cobrindo as cinco faixas
- [x] `.env.example`
- [x] Fixtures de evento da TikTok para teste sem estar ao vivo —
      `data/fixtures/`, com 4 payloads crus e 6 cenários de R4, R5 e F2
- [x] `npm test` valida os contratos: 36 testes, cada regra com o caso válido e
      o caso que ela tem que rejeitar

### Aberto pelo Bloco 0, para os blocos seguintes
- [ ] **Montar o acervo de verdade** (manual, véspera): subir e aprovar as
      imagens no Roblox, preencher `assetId` e mudar `status` para `aprovado`.
      Enquanto isso não acontecer, nenhum mapa pode ir ao ar.
- [x] ~~Conferir a forma do payload cru da TikTok~~ — feito no Bloco 1 contra a
      v2.4.4 instalada. Falta só confirmar numa live real que os campos vêm
      preenchidos como o tipo promete.
- [x] ~~Decidir a intensidade na coalescência~~ — resolvido pelo ADR-012:
      sobe um nível só quando a disputa é contestada.

## Bloco 1 — Ponte (`bridge/`) — **concluído**
- [x] Repositórios JSON com escrita atômica (temp + rename), único lugar com `fs`
- [x] Dois servidores Express em portas separadas: o do jogo (`/jogo/*`, com
      token e rate limit) é o único que o túnel publica; o do painel (`/api/*`)
      não existe naquela porta
- [x] Long-poll: registro, resposta no instante do evento, timeout de 20s,
      limpeza de órfão
- [x] Conector TikTok atrás da interface de evento normalizado, com a forma do
      payload conferida contra a v2.4.4, mais um conector de fixture para rodar
      sem live
- [x] Coleta e merge do catálogo de presentes
- [x] Casamento evento→slot, combo (R4) e combate (ADR-012)
- [x] SSE para o painel
- [x] Cliente Gemini com validação, checagem de jogabilidade e retentativa única
- [x] Cliente Roblox isolado: busca de item gratuito e cache de thumbnail (ADR-011)
- [x] Reconexão com backoff (F6) e detecção de jogo offline (F7)
- [x] 123 testes, incluindo um ponta a ponta que toca um cenário de fixture e
      confere o que sai pelo long-poll

### Aberto pelo Bloco 1
- [ ] **Testar se o HttpService do Studio alcança `127.0.0.1`.** Cinco minutos.
      Se alcançar, o túnel do ADR-002 vira opcional e some com ele a única
      exposição do sistema à internet e um terço do orçamento de latência.
      Ver a questão em aberto no ADR-002.
- [ ] **Medir a latência de verdade** numa live real e registrar em
      `memory/learnings.md`. A ponte já mede a própria fatia e manda no SSE.
- [ ] **Como o HUD mostra o combate** (ADR-012): disputa contestada e empate
      exato são estados novos que o espectador precisa entender na tela.
      Decisão de design do Bloco 2.

## Bloco 2 — Jogo (`game/`) — **concluído**
Construído por 9 agentes em paralelo, em três levas, com dono exclusivo por
arquivo. Relatório da síntese em `validacao-bloco-2.md`, neste diretório.

- [x] Laço de long-poll em Luau com `pcall` e backoff, mais um piso de 0,5s
      entre voltas sem evento, que segura o teto de 500 req/min do HttpService
- [x] Motor de movimento híbrido: física padrão, Tween na tomada de controle,
      watchdog independente de restauração (ADR-005, R11)
- [x] Rastreio de `plataformaReferencia` por colisão real (R9)
- [x] Detector de queda e respawn no checkpoint (R10, ADR-008)
- [x] Construtor de mapa a partir do spec, determinístico pelo mapaId
- [x] **Teste de jogabilidade do mapa:** percorre as plataformas construídas e
      confere que todo salto cabe no pulo, medindo o VÃO entre as bordas e não
      a distância entre centros (ADR-009)
- [x] Índice de animações e as 20 implementações
- [x] Aplicação do look por `HumanoidDescription`, com a cadeia de fallback de
      três degraus (ADR-010)
- [x] **Vestiário no jogo:** busca, equipar, prévia real, salvar look nomeado,
      trancado enquanto a sessão roda (ADR-011). Os dois lados.
- [x] Efeito permanente do personagem, suspenso durante animação de presente
- [x] HUD vertical, com os dois estados do combate na tela (ADR-012)
- [x] Câmera que acompanha e afasta em animação de peso 4 ou 5
- [x] `sessao.lua` amarrando tudo, e `inicio.server.lua` como entrada
- [x] Gate de sintaxe fora do Studio (`npm run luau`) e 141 testes

### Aberto pelo Bloco 2
- [ ] **Rodar dentro do Roblox Studio.** O gate prova que o Luau compila; não
      prova que a torre sobe, que o Tween pousa em cima da plataforma nem que o
      HUD lê no celular. É a validação que falta.
- [ ] **Conferir o teto de 20s do long-poll.** O ADR-002 chama o valor de chute
      inicial: se o Roblox derrubar a conexão antes, ajustar e registrar em
      `memory/learnings.md`.
- [ ] **Som:** `des_ancora` pede som de metal e o `SoundId` está vazio de
      propósito — som no Roblox também é asset com moderação (ADR-004).

## Bloco 3 — Painel (`panel/`) — **concluído**
Construído por 6 agentes em paralelo, em duas levas. Relatório da síntese em
`validacao-bloco-3.md`, neste diretório.

- [x] Seletor de modalidade e botão start/stop, com os três estados sempre
      visíveis e coloridos, sempre com texto junto
- [x] Editor de preset com os 6 slots lado a lado, sem scroll
- [x] Seletor de look com a grade de ícones das peças — **sem** prévia de corpo
      inteiro, que só existe no vestiário dentro do jogo (ADR-011)
- [x] Seletor de presente com busca, ícone oficial e cor por faixa, avisando
      quando o catálogo veio da semente e os valores não são confirmados
- [x] Seletor de animação com filtro por direção e peso, sem desabilitar nada:
      qualquer animação em qualquer slot (R1.5)
- [x] Aviso de vínculo fora da curva, não bloqueante (R3)
- [x] Gerador de mapa com pré-visualização do spec, e o estado que mais importa
      ali: spec válido que **ainda não pode ir ao ar** (ADR-004)
- [x] Monitor ao vivo: eventos, latência medida pela mediana, contador de não
      mapeado e os dois estados do combate (ADR-012)
- [x] Gate estrutural (`npm run painel:gate`) e 190 testes

### Aberto pelo Bloco 3
- [x] **Abrir o painel num navegador.** Feito na rodada 6, e valeu a pena: o
      BUG-008 passava por 504 testes verdes e só apareceu ali.
- [x] **Subir painel e ponte juntos.** F0-3, feito.
- [x] **Teste de componente renderizado.** Feito em 2026-09-10, **sem vitest e
      sem testing-library**: o `rolldown` que o Vite já trazia tem o
      transformador do oxc, e ele basta para o `node --test` montar `.jsx`. A
      decisão de arquitetura que faltava era menor do que parecia, e o que a
      destravou foi procurar de novo com o que já estava instalado. Ver
      `panel/test/ferramentas/` e `console/test/ferramentas/`.

## Bloco 3b — Pontas soltas do painel — **concluído**
O painel do Bloco 3 ficou completo como tela e incompleto como produto: a ponte
entregava dado que ele ignorava, e três regras de negócio não tinham nenhum
controle correspondente. Isto fecha os dois lados.

- [x] **Resumo pós-live (F5.5).** O `stop` já devolvia o resumo agregado e o
      painel jogava a resposta fora. Vira o `ResumoDaLive`, que serve também ao
      histórico
- [x] **Histórico de sessões.** A ponte gravava um arquivo por live desde o
      Bloco 1 e ninguém nunca leu. Página nova, `GET /api/sessoes`
- [x] **Prontidão de mapa salvo (ADR-004).** Só a geração respondia, e só para
      o mapa recém-nascido: escolher um mapa da lista deixava a prévia dizendo
      "ainda não avaliada", que desenha igual a "pode ir ao ar"
- [x] **Tela do acervo (ADR-004).** A tarefa manual que bloqueia toda a live
      era editar `data/acervo.json` na mão, com o schema recusando o arquivo
      inteiro quando um assetId caía no item errado
- [x] **Criar, duplicar e apagar preset.** Em máquina limpa `data/presets/`
      está vazio e não havia saída pela tela — era `npm run semear` ou escrever
      o JSON à mão
- [x] **Trocar preset ao vivo (R7).** A regra permite desde sempre; o painel
      era o único lugar que proibia
- [x] **Vitória e reinício (R6).** Não existia em processo nenhum. Jogo detecta
      por colisão, HUD mostra o selo "TOPO", painel decide, e a ordem volta
      pelo long-poll (ADR-013)
- [x] **Coletar catálogo pelo painel.** `api.atualizarCatalogo()` existia e
      nenhum componente chamava: o aviso da semente apontava o problema e não
      oferecia a saída
- [x] **Intensidade no testador de animação.** A ponte já aceitava o parâmetro;
      o painel só sabia testar no nível 3
- [x] **Vincular presente não mapeado a um slot.** O contador dizia o que
      estava sendo deixado na mesa e não deixava agir
- [x] **Bug de contrato:** `POST /jogo/estado` era descartado por INTEIRO desde
      o Bloco 2 — `montarEstado` publica `totalPlataformas` e `sessaoAtiva`, e
      o schema é `additionalProperties: false` sem os dois. A rota respondia
      204 como se estivesse tudo bem e o painel ficava com a plataforma em "—"
      para sempre. Hoje um teste compara a fonte do jogo com o schema

### Aberto pelo Bloco 3b
- [ ] **Nada disto rodou no Studio nem no navegador.** A vitória e o reinício
      são os que mais pedem: o teste prova que a ordem sai da ponte e que o
      Luau compila, não que o boneco volta ao pé da torre.
- [ ] **Trocar preset ao vivo grava só o ÚLTIMO preset no resumo.** O arquivo
      de sessão guarda um `presetId` e o schema não tem lugar para uma lista. A
      troca fica na linha `preset_trocado_ao_vivo` do log. Se isso incomodar em
      live de verdade, é mudança de contrato.
- [ ] **O painel não sobe imagem para o Roblox**, e não vai subir: upload de
      asset gerado por IA está adiado no ADR-004. A tela do acervo anota o
      resultado da moderação, não a substitui.

## Camada de produto (a partir de 2026-09-09)

O `docs/00_VISAO/plano-de-produto.md` abriu a camada de produto sobre os blocos
acima. Os blocos 0 a 3b continuam sendo a fundação e não mudam.

- **Fase 0 — provar em você.** A lista fechada de fixes está em
  [`fase-0-fixes-minimos.md`](./fase-0-fixes-minimos.md). Regra de corte: só
  entra o que impede rodar uma live inteira sem travar. O Bloco 4 abaixo foi
  absorvido por ela.
- **Fase 1 — produto vendável v1.** ~~i18n (ADR-P03) como primeiro commit~~ —
  **feito em 2026-09-09**, rodada 1 do ciclo (`specs/_loop.md`): 627 chaves em
  PT, ES e EN, 465 testes verdes. ~~Empacotamento~~ — **aplicativo portátil
  feito em 2026-09-10** (ADR-P07): `npm run empacotar` produz o
  `KoraStreamGames.exe`, um programa Electron com janela nativa e sem console, e
  o passo a passo de instalar na máquina de outra pessoa está em
  [`instalacao-na-maquina-do-cliente.md`](./instalacao-na-maquina-do-cliente.md).
  Depois Supabase (ADR-P02), instalador (ADR-P04), console v1 (ADR-P05) e venda.

> **O que depende de você e não de mim** está reunido num lugar só:
> [`tarefas-do-dono.md`](./tarefas-do-dono.md) — decisão de negócio, dinheiro,
> conta em serviço de terceiro e a sessão no Studio.

### Registrado e não executado

- [ ] **As sprites de VFX das animações.** As 32 animações fazem geometria,
      hélice, onda, tremor e esteira, e **nenhuma usa textura**: partícula,
      feixe e trilha saem no borrão redondo padrão do Roblox. É a última coisa
      grande que separa o efeito de "engine" do impacto de anime, e a mais
      barata, porque toda a estrutura já está montada.
      O encaixe está pronto e testado (`game/src/shared/texturas.lua`): treze
      nomes de domínio, todos vazios, que as animações já pedem pelo nome. Falta
      **gerar as imagens**, 512x512 com fundo preto e forma clara, subir pelo
      acervo e esperar a moderação (ADR-004). Preenchido o catálogo, a sprite
      aparece em toda animação que a pede, sem tocar em módulo nenhum.
      **Restrição registrada:** estilo de anime é livre, personagem de anime não
      é. Asset de terceiro derruba a conta do Roblox de que o produto depende.


- [ ] **Refatoração do layout do painel**, pedida pelo dono em 2026-09-10.
      Nove abas em ordem cronológica, não de uso; a aba "Ao vivo" empilha o
      editor inteiro acima do que se opera durante a live; o único alarme do
      produto é um número ao lado da palavra "Log". O problema está escrito, com
      o que não pode quebrar e o que medir antes de desenhar, em
      [`refatoracao-do-layout.md`](./refatoracao-do-layout.md).

### O que falta no portátil

- [x] **Instalação limpa abre o painel com os seis slots em vermelho.** Feito em
      2026-09-10. Com o catálogo semente em mãos o painel não tem como afirmar
      que um presente real é desconhecido, e não afirma mais: a pastilha por
      cartão se cala e sobe uma linha só, dizendo que falta coletar da live.
      Com catálogo real tudo volta a ser como era, porque ali a acusação é
      verdadeira.
- [x] **`LEIA-ME.txt` em inglês.** Feito em 2026-09-10. `npm run empacotar` sai
      em português e `npm run empacotar -- --idioma=en` em inglês.
- [ ] **Assinatura de código.** US$ 200 a 400/ano, adiada no ADR-P07. Reavaliar
      quando o cliente deixar de ser conhecido.
- [x] **Atualização automática.** Feita em 2026-09-10, pelo GitHub Releases, que
      custa US$ 0. Ela é covarde de propósito: nunca no arranque, nunca uma
      caixa de diálogo, nunca reiniciar sozinha, e nunca no portátil. Falta só o
      dono publicar o primeiro release, com o Setup **e** o `latest.yml`.
- [x] **O instalador do ADR-P04.** Feito em 2026-09-10, do mesmo build. Instala
      só para o usuário, sem pedir administrador. O dado do streamer vai para o
      perfil e **não** para a pasta de instalação, senão o desinstalador levaria
      o trabalho dele junto. Verificado instalando, rodando e desinstalando numa
      pasta de teste.
- **Fase 2 — distribuição e recorrência.**

Bloqueia a Fase 1 inteira: a decisão do dono sobre o
[ADR-P06](../08_DECISOES/adr-p06-uso-comercial-da-captura.md).

## Bloco 4 — Validação
*Absorvido pela Fase 0. Mantido aqui porque os itens continuam válidos.*
- [ ] Medir latência ponta a ponta e registrar em `memory/learnings.md`
- [ ] Live de teste de 30 minutos sem intervenção
- [ ] Checklist de segurança de `11_SEGURANCA` inteiro verde
- [ ] Checklist da Fase 4 da skill `fundacao-de-projeto`

## Adiado explicitamente
- Times HERÓI × VILÃO
- Espectador com personagem próprio
- Outras modalidades
- Multi-streamer, auth, banco
- Upload automático de asset gerado por IA (ver ADR-004)
