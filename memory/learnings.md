# Aprendizados — Kora Stream Games

> Registrar aqui o que só se descobre rodando. Um aprendizado por bloco, com data.

## 2026-09-01 — Referência de mercado analisada
Vídeo de referência (live do criador SAKAY) mostra o formato já validado:
plataformas numeradas, boneco subindo de 162 para 184 em poucos segundos,
formato vertical, painel lateral de presentes com rótulos curtos (+100, WIN,
LIKE, SEGUIR, Inverte WIN) e times HERÓI × VILÃO. Os rótulos são curtos e
grandes porque a live é vista no celular. Aplicar isso ao HUD do jogo.

## 2026-09-01 — Bloco 0: o que os contratos revelaram
- **O acervo é o gargalo real do gerador de mapa, não o Gemini.** Enquanto as
  imagens não estiverem enviadas e aprovadas no Roblox, nenhum mapa pode ir ao
  ar, por mais válido que o spec seja. `npm test` reporta isso explicitamente.
- **Props precisavam sair do código.** O tipo de prop é escolha do modelo dentro
  de lista fechada, igual a skybox e textura. Virou terceira coleção do acervo.
  Ver a nota de implementação no ADR-004.
- **Privacidade cabe no schema.** `additionalProperties: false` no log de sessão
  e no evento normalizado transforma a regra de LGPD em erro de validação em vez
  de disciplina de quem escreve o código. O teste prova que `nomeDoador`,
  `userId` e `profilePictureUrl` são rejeitados no log persistido.
- **A duração da animação e o R11 são a mesma restrição.** O teto de 3,5s da
  biblioteca é o que limita o bloqueio de controle do streamer. Por isso o teto
  está no schema e não só na tabela da biblioteca.

## Não confirmado, conferir na primeira conexão real
A forma do payload cru em `data/fixtures/tiktok-cru/` é a **esperada** do
`tiktok-live-connector`, não a verificada. A biblioteca é não oficial (ADR-006)
e muda entre versões. Até conferir, um teste verde do normalizador prova que ele
é coerente consigo mesmo, não que ele entende a TikTok. Na primeira conexão:
despejar um evento cru, comparar, corrigir a fixture e anotar aqui.

## Pendente de medição (preencher na primeira live de teste)
- Latência real TikTok → ponte (estimativa inicial: 200 a 500ms, fora do nosso
  controle).
- Latência real ponte → Roblox com long-poll (estimativa: 100 a 300ms).
- Taxa de reconexão do tiktok-live-connector numa live de 2 horas.
- Se o Roblox derruba a conexão de long-poll antes dos 20s configurados.
