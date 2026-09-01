# 05 — Fluxos

## F1 — Preparar a live (antes de entrar ao vivo)
1. Streamer abre o painel em `localhost`.
2. Escolhe a modalidade. Na Fase 1 só existe **Escalada**, mas o seletor existe.
3. Escolhe um mapa existente ou gera um novo (F4).
4. Monta o preset: para cada um dos 6 slots, escolhe presente, animação, delta e
   intensidade. O painel avisa se o vínculo foge da curva, mas não bloqueia.
5. Salva o preset.
6. Abre o Roblox e entra na experiência. O jogo começa o long-poll sozinho.
7. Clica em **Start** no painel. A ponte conecta na live e a sessão começa.
8. Configura os 6 mesmos presentes como desejos no app da TikTok, para o
   espectador ver os mesmos itens que o sistema entende.

## F2 — Presente durante a live (caminho crítico)
1. Espectador envia presente.
2. `tiktok-live-connector` emite o evento na ponte.
3. Ponte normaliza: `{presenteId, repeatCount, nomeDoador}`.
4. Ponte procura o `presenteId` nos 6 slots do preset ativo.
   - Não achou: descarta, incrementa contador de "presente não mapeado" e segue.
     Isso aparece no painel para o streamer ajustar depois.
   - Achou: calcula `delta * repeatCount`, aplica cooldown e coalescência (R5).
5. Ponte responde o long-poll pendente do Roblox com
   `{animacaoId, delta, intensidade, nomeDoador, presenteNome}`.
6. Roblox recebe e calcula o destino a partir de `plataformaReferencia` (R9),
   respeitando os limites (R6). Se o streamer estiver no ar, **interrompe o pulo
   na hora** (R11). Zera velocidade, ancora, dispara o Tween de movimento e o
   módulo da animação em paralelo, com o watchdog armado.
7. HUD atualiza o número e mostra o nome do doador.
8. **Em paralelo e fora do caminho crítico:** ponte grava o evento no log da
   sessão e empurra para o painel via SSE.

## F3 — Combate de presentes
1. Chegam 5 presentes em 300ms.
2. O primeiro pega o boneco livre e dispara na hora.
3. Os outros quatro chegam durante a animação e entram no combate: subidas
   somam entre si, descidas somam entre si, os lados se anulam (ADR-012).
4. A animação termina, o combate fecha e o boneco anda o **líquido**. Toca a
   animação do maior presente do lado vencedor, com intensidade +1 se a disputa
   foi contestada.
5. Nada espera mais de 2s. Passou disso, aplica o líquido com efeito curto.
6. Líquido zero: ninguém anda, e o painel mostra o empate.

## F4 — Gerar mapa com IA
1. Streamer descreve o ambiente em texto livre no painel
   (ex.: "torre vulcânica ao entardecer, plataformas de rocha").
2. Painel envia o texto para a ponte. **O painel não fala com o Gemini.**
3. Ponte monta o prompt (ver `10_PROMPTS`), injetando o acervo disponível de
   skybox e textura, e chama a API do Gemini.
4. Gemini devolve JSON com layout, paleta, props e a escolha de asset **dentro
   do acervo**.
5. Ponte valida contra o schema. Asset fora do acervo, número fora da faixa ou
   campo faltando: rejeita e tenta de novo uma vez, depois devolve erro claro.
6. Ponte salva em `data/mapas/` e devolve o spec para o painel.
7. Painel mostra a pré-visualização: altura, paleta, densidade, contagem de
   plataformas. Streamer aprova ou gera de novo.
8. Na próxima entrada na experiência, o Roblox baixa o spec e constrói o mapa.

**Trocar de mapa exige reentrar na experiência.** Reconstruir 250 plataformas ao
vivo travaria a partida. Isso é limitação aceita, documentada em ADR-004.

## F4b — Queda natural durante o parkour
1. Streamer erra o pulo e o detector de queda dispara (R10.2).
2. Zera velocidade, reposiciona em `plataformaReferencia`, zera de novo,
   devolve o controle.
3. Nenhum progresso é perdido e nada é enviado para a ponte além do estado.
4. Se a queda acontecer **durante** uma animação, o detector fica suspenso: quem
   manda é o Tween.

## F5 — Fim da sessão
1. Streamer clica em Stop.
2. Ponte desconecta da live e fecha os long-polls.
3. Sessão é finalizada: grava resumo (altura máxima, total de presentes por slot,
   latência média).
4. **Todo dado de espectador do log é descartado.** Ver `11_SEGURANCA`.
5. Painel mostra o resumo da live.

## F6 — Queda da live
1. Conector perde conexão.
2. Ponte tenta reconectar com backoff (1, 2, 4, 8, teto 30s).
3. Painel mostra o estado "reconectando" em destaque.
4. Jogo permanece no estado atual. Nenhum evento é inventado.
5. Reconectou: coleta de catálogo roda de novo e a sessão continua na mesma.

## F7 — Queda do jogo
1. Roblox para de fazer long-poll.
2. Após 60s sem requisição, ponte marca o jogo como offline.
3. Eventos que chegarem nesse período são **descartados**, não acumulados. Aplicar
   uma pilha de deltas de uma vez quando o jogo voltasse seria pior que perder.
4. Painel mostra o aviso para o streamer reabrir a experiência.
