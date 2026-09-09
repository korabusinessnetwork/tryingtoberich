# Ledger do ciclo — Kora Stream Games

Uma seção por rodada, mais recente no topo.

## Rodada 1 — i18n por chave (ADR-P03) — 2026-09-09
- Spec: `specs/i18n-por-chave.md`
- Resultado da review: **aprovado sem ressalvas**, depois de o próprio review
  fechar o critério 13, que o build tinha deixado passar (locale cravado)
- Aprendido: `memory/learnings.md` e `memory/patterns.md`
- Commit: `cb165f5` na branch `claude/monta-b1h5fy` — **sem push** (ver pendência)
- Números: 627 chaves × 3 idiomas, 35 arquivos retrofitados, 465 testes verdes
  (eram 451), 3 gates verdes
- Pendente de decisão:
  1. **Push.** A branch de trabalho é a branch padrão do repositório, e tanto o
     `/ciclo` quanto o harness proíbem push na padrão. Decidir: abrir branch de
     trabalho para esta rodada, ou autorizar o push na `claude/monta-b1h5fy`.
  2. **ADR-P06** continua Proposto e bloqueia vender. Não bloqueia código.
- Próximo item recomendado: **`F0-7`, testar se o `HttpService` do Studio
  alcança `127.0.0.1`** — cinco minutos, e é o que decide se o Cloudflare Tunnel
  sai do produto (ADR-P04). Melhor relação custo/benefício aberta no projeto.

### O que ficou aberto dentro do escopo
- **O teto de 8 caracteres do HUD não morde hoje.** O teste existe e olha
  `hud.giftLabel.*`, e nenhuma chave nasceu com esse prefixo — o rótulo de
  presente é montado com o nome que vem da TikTok, não com chave. O teste está
  certo e guarda o dia em que existir; hoje ele não protege nada. Registrado
  para não parecer cobertura que não há.
- **`hud.overlay.pageTitle` em espanhol tem 22 caracteres contra 18 do PT.** É
  o `<title>` do documento, não desenha nada na tela do espectador. A agente
  reportou; aceito.
- **Mensagem de erro que a PONTE gera** continua sem tradução, por escolha do
  spec: traduzi-la exige a ponte devolver código em vez de frase, que é mudança
  de contrato e merece rodada própria.
