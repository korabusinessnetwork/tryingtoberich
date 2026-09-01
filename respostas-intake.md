# Respostas do Intake — Kora Stream Games

> Fonte de verdade das respostas da entrevista de fundação. O `scaffold.sh` lê
> este arquivo para substituir os placeholders. Preencha durante a Fase 1.
> Data do intake: 2026-09-01 · Conduzido por: Matheus Bonato

## Bloco 1 — Produto e identidade
- **PRODUTO (nome + essência):** Kora Stream Games
- **ESSENCIA (1 frase):** Motor de jogos interativos para TikTok LIVE, onde presentes dos espectadores controlam o jogo em tempo real
- **PROBLEMA que resolve:** Lives de jogo no TikTok dependem de sistemas prontos, engessados e pagos, sem controle sobre animacoes, mapas e regras
- **PROPOSTA de valor / diferencial:** Painel proprio onde o streamer escolhe modalidade, monta os 6 slots de presente e gera mapas com IA, tudo em infraestrutura gratuita
- **Existe código ou é do zero?** Do zero

## Bloco 2 — Público e escopo
- **PUBLICO_ALVO primário:** Streamer de TikTok LIVE que joga Roblox ao vivo
- **PERSONAS (1-3):** Matheus (dono, streamer e dev)
- **B2B / B2C / B2B2C:** Ferramenta interna agora, B2C no roadmap
- **"Aha moment":** Espectador manda o presente e ve o boneco disparar como um cometa em menos de 1 segundo

## Bloco 3 — Multi-tenant e white-label
- **MULTI_TENANT:** single-agora-multi-roadmap  <!-- multi-desde-já / single-agora-multi-roadmap / single-definitivo -->
- **WHITE_LABEL:** nao agora, modelar para nao travar depois     <!-- sim / não -->
- **PLANOS (free/pro/enterprise):** nenhum na Fase 1

## Bloco 4 — Stack e arquitetura
- **STACK:** Roblox/Luau (jogo) + Node.js (ponte) + React/Vite (painel local) + JSON em disco
- **MODELO_ARQUITETURA:** C-hibrido: cliente de jogo externo + servico local sem banco  <!-- A: SPA+BaaS / B: API própria / C: serviço sem UI -->
- **TEM_UI:** sim (painel local)
- **DEPLOY:** local, sem deploy publico (exceto tunel Cloudflare para a ponte)
- **SCHEMA_PATH:** data/schemas/
- **ENV_PREFIX:** import.meta.env.VITE_ / process.env.  <!-- ex: import.meta.env.VITE_* -->
- **TEST_CMD:** npm test       <!-- ex: npm test -->

## Bloco 5 — Segurança e compliance
- **Trata dado pessoal/financeiro/de menores?** nao trata dado financeiro; trata nickname e evento de presente de espectadores
- **COMPLIANCE específico:** LGPD (dado minimo, retencao curta)  <!-- LGPD / GDPR / PCI / fiscal / nenhum -->
- **Nível de isolamento entre clientes:** streamerId presente no modelo desde a Fase 1, sem enforcement ainda

## Bloco 6 — Custo
- **FASE_CUSTO:** bootstrap gratuito  <!-- bootstrap gratuito / com orçamento -->
- **Serviços pagos já aprovados:** nenhum (Gemini em tier gratuito)

## Bloco 7 — Design (se tem UI)
- **Identidade visual definida?** nao definida, herda tom da Kora
- **Referências / tom visual:** painel escuro, denso, operacional
- **Contexto de uso crítico:** desktop, segunda tela durante a live  <!-- toque/PDV, mobile, desktop -->
- **PRINCIPIO_N1:** LATENCIA  <!-- default UI: INTUITIVIDADE -->

## Roadmap inicial
- **FASE_ATUAL:** Fase 1 - Escalada
- **Próximas fases:** Fase 2 outras modalidades, Fase 3 produto para outros streamers
