# Handoff para o Claude Code

Cole isto como primeira mensagem ao abrir o projeto no Claude Code.

---

Este projeto está documentado e **não tem uma linha de código**. Antes de
escrever qualquer coisa:

1. Leia `CLAUDE.md` inteiro. O Princípio nº1 é latência e ele veta decisões.
2. Leia os 7 ADRs em `docs/08_DECISOES/`. Eles registram restrições reais das
   plataformas (Roblox, TikTok), não preferências. Não contorne nenhuma sem
   escrever um ADR novo que supersede o anterior.
3. Leia `docs/09_BACKLOG/`. Construa na ordem dos blocos.

## Comece pelo Bloco 0 e pare
O Bloco 0 são os contratos: JSON Schemas, acervo, semente de catálogo,
`.env.example` e fixtures de evento. **Termine o Bloco 0 e me mostre antes de
seguir.** Os blocos 1, 2 e 3 dependem desses contratos e podem ser construídos em
paralelo depois, com dono exclusivo por diretório.

## Armadilhas específicas deste projeto
- **Não** faça polling de intervalo fixo entre Roblox e ponte. É long-poll. ADR-002.
- **Não** use `fs` fora de `bridge/src/repos/`. ADR-003.
- **Não** peça ao Gemini para gerar textura ou skybox. Ele escolhe do acervo. ADR-004.
- **Não** aceite mapa com salto maior que o pulo alcança. O mapa tem que ser
  vencível sem presente nenhum, senão a live vira tela parada e o TikTok pune.
  ADR-009.
- **Não** tire a física do personagem. O streamer JOGA o parkour. Física é o
  padrão, Tween é tomada de controle temporária, e toda tomada tem watchdog.
  ADR-005 e R11.
- **Não** acumule a posição do boneco na ponte. O jogo é dono da posição. R9.
- **Não** trate queda natural como perda de progresso, e **não** esqueça que
  presente de descida redefine o checkpoint. ADR-008 e R10.
- **Não** crie tabela fixa de presente para animação. O vínculo é escolha do
  streamer nos 6 slots. ADR-007.
- **Não** hardcode valor em moedas de presente. O catálogo é coletado da live.
- **Não** exponha `/api/*` pelo túnel. Só `/jogo/*`. `docs/11_SEGURANCA`.
- **Não** faça upload de roupa própria. O personagem é composto de item gratuito
  do catálogo, por código, com fallback. ADR-010.
- **Não** tente renderizar prévia do boneco montado no painel. A prévia de corpo
  inteiro só existe no vestiário dentro do jogo. ADR-011.
- **Não** deixe o vestiário acessível com a sessão rodando, e não aplique look no
  meio da jogatina. ADR-011 e ADR-009.

## Definição de pronto de qualquer bloco
Checklist de `docs/11_SEGURANCA` na parte que o bloco toca, mais os testes do
bloco passando, mais o doc atualizado se algo mudou de verdade. Doc e código
divergindo é bug.
