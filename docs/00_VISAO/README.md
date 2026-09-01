# 00 — Visão

## O que é
Kora Stream Games é um motor de jogos interativos para TikTok LIVE. O streamer
joga, os espectadores mandam presentes, e cada presente dispara uma ação no jogo
em tempo real. A Fase 1 entrega uma modalidade: **Escalada**.

## Modalidade 1 — Escalada
**O streamer joga o parkour de verdade**, com controle normal, subindo uma torre
de plataformas numeradas. Os espectadores influenciam a subida: cada presente
configurado empurra o boneco para cima ou para baixo, com uma animação escolhida
pelo streamer. Errar o pulo não custa progresso (ADR-008), então **a única forma
de perder altura é a plateia.** O objetivo da live é chegar o mais alto possível,
com a plateia decidindo se ajuda ou atrapalha.

Referência visual: lives de obby no Roblox em formato vertical, com HUD lateral
de presentes e contador de plataforma grande e legível no celular.

## Escopo da Fase 1

Está dentro:
- Uma modalidade (Escalada), streamer jogando com controle normal
- Painel local com seletor de modalidade, botão de start e monitor da sessão
- Seis slots de presente por preset, com vínculo livre a qualquer animação
- Biblioteca de 20 animações (10 de subida, 10 de descida)
- Catálogo de presentes da TikTok coletado automaticamente, com busca no painel
- Gerador de mapa por Gemini (layout e paleta, dentro de acervo pré-aprovado)
- Vestiário dentro do jogo para montar looks, seletor de look no painel
- Ponte de eventos da live com latência abaixo de 1 segundo

Está fora (e é explicitamente adiado):
- Outras modalidades (Fase 2)
- Times HERÓI × VILÃO (o vídeo de referência tem, a Fase 1 não)
- Espectador controlando personagem próprio
- Multi-streamer, autenticação, banco de dados, planos (Fase 3)
- Deploy público do painel

## Requisito de plataforma que manda no design
O TikTok penaliza live que pareça automatizada. Por isso o jogo **precisa ser
jogado**, com o streamer ativo o tempo todo, e o mapa precisa ser vencível só com
habilidade. O presente acelera ou atrapalha, nunca é o meio de locomoção.
Qualquer mecânica que produza tempo parado esbarra nisso. Ver ADR-009.

## Métrica de sucesso da Fase 1
1. Latência do presente até o primeiro frame de animação abaixo de 1000ms.
2. Live de 2 horas sem intervenção manual no sistema.
3. Trocar de mapa entre duas lives sem abrir o Roblox Studio.
4. Montar um preset novo em menos de 2 minutos.

## Por que Roblox e não uma engine web
Decisão do dono, registrada em ADR-001. O Roblox entrega física, câmera,
avatar e catálogo de assets prontos, e é o ambiente onde o streamer já produz
conteúdo. O custo é uma ponte de rede mais elaborada e um teto na geração de
assets por IA. Ambos estão mitigados em ADR-002 e ADR-004.
