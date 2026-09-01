# Aprendizados — Kora Stream Games

> Registrar aqui o que só se descobre rodando. Um aprendizado por bloco, com data.

## 2026-09-01 — Referência de mercado analisada
Vídeo de referência (live do criador SAKAY) mostra o formato já validado:
plataformas numeradas, boneco subindo de 162 para 184 em poucos segundos,
formato vertical, painel lateral de presentes com rótulos curtos (+100, WIN,
LIKE, SEGUIR, Inverte WIN) e times HERÓI × VILÃO. Os rótulos são curtos e
grandes porque a live é vista no celular. Aplicar isso ao HUD do jogo.

## Pendente de medição (preencher na primeira live de teste)
- Latência real TikTok → ponte (estimativa inicial: 200 a 500ms, fora do nosso
  controle).
- Latência real ponte → Roblox com long-poll (estimativa: 100 a 300ms).
- Taxa de reconexão do tiktok-live-connector numa live de 2 horas.
- Se o Roblox derruba a conexão de long-poll antes dos 20s configurados.
