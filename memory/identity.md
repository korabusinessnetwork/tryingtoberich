# Identidade do Produto — Kora Stream Games

## Propósito Central

### Visão
Ser o motor de jogos interativos das lives da Kora: qualquer modalidade de jogo,
qualquer plataforma de live, com o espectador dirigindo a partida através dos
presentes. Fase 1 entrega uma modalidade. A arquitetura já nasce para receber
as próximas sem reescrita.

### Propósito
- **Problema:** lives de jogo no TikTok dependem de sistemas prontos, engessados
  e frequentemente pagos. O streamer não controla quais presentes valem o quê,
  não escolhe as animações, não muda o mapa e não cria modalidade nova.
- **Como resolvemos:** painel próprio onde o streamer escolhe a modalidade, monta
  os 6 slots de presente, escolhe a animação de cada slot na biblioteca e gera
  mapa novo com IA, tudo em infraestrutura gratuita.
- **Impacto esperado:** live com identidade própria e presente com resposta
  imediata, o que aumenta a taxa de envio de presente por espectador.

## Público-Alvo

| Segmento | Perfil | Contexto | Necessidade |
|---|---|---|---|
| Streamer-dev (Fase 1) | Dono do produto, joga Roblox ao vivo no TikTok | Segunda tela ao lado da live, formato vertical | Controle total de regra e visual sem depender de ferramenta de terceiro |
| Streamer de jogo (roadmap) | Faz live de Roblox/jogo casual no TikTok | Sem conhecimento técnico | Configurar tudo por painel, sem tocar em código |

## Valores
- **Latência acima de tudo:** o espectador precisa ver a causa e o efeito juntos.
- **Sem lock-in:** dado do streamer é arquivo em disco dele, exportável.
- **Custo zero na Fase 1:** nada pago entra sem decisão explícita do dono.
- **Configuração no painel, nunca no código:** regra que muda toda live não é código.

## Posicionamento

**Para** streamers de TikTok LIVE que jogam ao vivo / **que** cansaram de
ferramentas prontas que não deixam mudar animação, mapa ou regra /
**Kora Stream Games** é um motor de jogos controlado por presentes /
**que** entrega reação em menos de 1 segundo e mapa gerado por IA a cada live /
**Diferente de** bots de live genéricos e sistemas fechados /
**entrega** controle total da mecânica e do visual.

## Tom de Voz

**Princípios:** direto, operacional, sem jargão de marketing.

- ✅ "Escolha 6 presentes. Um clique em cada, e a live está pronta."
- ❌ "Plataforma integrada de engajamento gamificado para criadores de conteúdo."

## Personas

### Matheus, streamer e dono
- **Contexto:** faz live de Roblox no TikTok em formato vertical, já roda um
  overlay próprio de ranking de engajamento feito em Node e OBS.
- **Dores:** ferramenta pronta não deixa escolher animação nem mapa; ajustar
  regra no meio da live é impossível; presente demora a refletir no jogo.
- **Objetivos:** montar o preset antes da live em menos de 2 minutos; trocar de
  mapa entre uma live e outra sem abrir o Roblox Studio.
- **Sucesso:** live inteira sem tocar em código, e nenhum espectador reclamando
  que o presente "não fez nada".

## Princípios do Produto
- Latência percebida é a métrica número 1 (ver `CLAUDE.md`).
- Seis slots, sempre. O limite não é técnico, é o formato da TikTok. Respeitar.
- Biblioteca de animações é aberta: qualquer animação pode ir em qualquer slot.
- O valor do presente **sugere**, nunca **decide**.

## Identidade Visual (marca)
- **Tom visual do painel:** escuro, denso, operacional. É ferramenta de segunda
  tela durante a live, não landing page.
- **Tom visual do jogo:** definido por mapa, gerado a cada live (ver 10_PROMPTS).
- Marca ainda não definida. Herda a paleta da Kora quando existir.

## Roadmap

- **Fase 1 (atual) — Escalada:** uma modalidade (subir/descer plataformas), 6 slots,
  20 animações, catálogo de presentes, gerador de mapa por IA, painel local.
- **Fase 2 — Modalidades:** segunda e terceira modalidade sobre o mesmo motor,
  seletor de modalidade no painel já entregue na Fase 1.
- **Fase 3 — Multi-streamer:** `streamerId` deixa de ser `"local"`, storage sai
  do JSON para banco, painel ganha auth. Ver ADR-003.
- **Fase 4 — Produto:** onboarding, planos, mapas compartilhados entre streamers.
