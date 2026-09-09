# Plano de produto — Kora Stream Games

**Data:** 2026-09-09 · **Dono:** Matheus Bonato
**Meta:** US$ 2.000/mês líquido em 90 dias, vendendo para streamers de TikTok
LIVE de língua inglesa.

Este documento é a camada de **produto** sobre a fundação que já roda. Ele não
substitui `identity.md`, `01_ARQUITETURA` nem os ADRs de 001 a 016 — todos
continuam valendo inteiros.

> **Origem e divergências.** Este plano nasceu de `KSG_PLANO_PRODUTO.md`,
> trazido pelo dono. Ele foi conferido contra a plataforma e contra o
> repositório, e **cinco pontos do original não sobreviveram à checagem**. Estão
> listados na seção 9, com o que foi corrigido e por quê. Onde este documento
> diverge do original, este vale.

---

## 1. Estado atual

O que existe e continua valendo:

- Ponte em Node com `tiktok-live-connector`, long-poll (ADR-002) e SSE para o painel
- Painel React local, com preset, catálogo, animações, mapa, acervo e monitor ao vivo
- Jogo em Luau: escalada, 20 animações, HUD, vestiário, vitória e reinício
- Overlay do OBS com HUD da live e cutscene (ADR-014, ADR-015)
- Persistência em JSON atrás de repositório (ADR-003), tudo com `streamerId`
- 451 testes verdes; 6 bugs conhecidos, todos corrigidos
- Uso single-user: só o dono

O que falta para virar produto: licenciamento, instalação por terceiro,
telemetria, i18n, console de operação, e estabilidade quando o TikTok mudar.

**A ressalva que manda em tudo:** quase nada do sistema jamais rodou fora do
teste. Ver `docs/09_BACKLOG/fase-0-fixes-minimos.md`.

---

## 2. Decisões fechadas nesta rodada

O plano original abria com uma decisão bloqueante e pedia mais duas. Foram
escritas seis, porque a checagem mostrou que faltavam três.

| ADR | Decisão | Status |
|---|---|---|
| [P01](../08_DECISOES/adr-p01-motor-do-produto.md) | **Manter Roblox** como motor do produto | Aceito |
| [P02](../08_DECISOES/adr-p02-supabase-fonte-da-verdade.md) | Supabase (tier grátis) como fonte da verdade de contas, licenças e telemetria | Aceito |
| [P03](../08_DECISOES/adr-p03-i18n-por-chave.md) | i18n por chave em PT/ES/EN; funil só em inglês na Fase 1 | Aceito |
| [P04](../08_DECISOES/adr-p04-distribuicao-em-roblox.md) | O cliente roda no **Roblox Studio dele**, com ponte e painel ao lado | Aceito |
| [P05](../08_DECISOES/adr-p05-console-do-operador.md) | Console do operador: fronteira do v1 congelada em 6 itens | Aceito |
| [P06](../08_DECISOES/adr-p06-uso-comercial-da-captura.md) | Uso comercial da captura não oficial | **Proposto — aguarda o dono** |

O produto, em uma frase: **o sistema que roda hoje na máquina do dono,
empacotado com instalador, licença e telemetria, rodando na máquina de outro
streamer.** "Gourmetizado", nas palavras dele.

---

## 3. Regra de sequenciamento

Com o ADR-P01 mantendo o Roblox, a regra do plano original **deixa de existir**.
Ela dizia que polir o Roblox seria custo afundado se o produto migrasse para
web. Não vai migrar.

O que fica no lugar:

> Os fixes da Fase 0 servem à prova das 5 lives **e** ao produto, porque são o
> mesmo código. Nada é jogado fora. Mas a régua de escopo continua igual: na
> Fase 0 só entra o que impede rodar uma live inteira sem travar.

Modalidades 2 e 3 nascem em Luau, sobre o mesmo motor.

---

## 4. Fases e portões

### Fase 0 — semanas 1 e 2: provar em você
Custo zero. Nada de produto ainda.

- Fixes mínimos da escalada — a lista fechada está em
  [`09_BACKLOG/fase-0-fixes-minimos.md`](../09_BACKLOG/fase-0-fixes-minimos.md)
- 5 lives em inglês com o jogo ativo
- Registrar presentes por live, antes e depois
- Gravar tudo: os clipes são o material de venda da Fase 2

**Portão:** os presentes aumentam de forma visível nas lives com o jogo. Se não
aumentarem, o produto não tem argumento. Para e reavalia, não avança por
teimosia.

### Fase 1 — semanas 3 a 6: produto vendável v1

| Camada | O que muda | O que continua |
|---|---|---|
| Conexão | Conector cru vira API gerenciada (EulerStream) | Mesmos eventos, mesma lógica de pontuação, mesma interface normalizada |
| Estado | Supabase para conta, licença, telemetria e log (P02) | JSON local segue como preset, mapa, look e estado de partida |
| Idioma | i18n por chave, PT/ES/EN, **primeiro commit da fase** (P03) | — |
| Distribuição | Instalador Windows com runtime embutido + atualizador (P04) | Roblox Studio, ponte, painel e OBS: a topologia de hoje |
| Console | Console do operador v1, seis itens (P05) | — |
| Catálogo | 3 modalidades no lançamento | Biblioteca de animações e escolha manual por presente |
| Venda | Lemon Squeezy, license key, entrega automática | — |

**Portão:** 10 vendas em 14 dias, com tráfego vindo só das lives dele. Se não
bater, o problema é oferta ou preço, não volume.

### Fase 2 — semanas 7 a 12: distribuição e recorrência

- Recorrência a US$ 12/mês: modalidade nova por mês, overlay hospedado,
  correção quando o TikTok quebrar
- 1 short por dia em inglês, formato "this gift did THIS to my game"
- Afiliados a 30%, nativo no Lemon Squeezy
- Console v2 e funil em ES e PT, **só depois de saber de onde vêm os clientes**

---

## 5. A conta, refeita

O plano original dizia "~50 packs de US$ 39 e ~90 assinantes a US$ 12/mês, bruto
aproximado de US$ 2.100". **A soma não fecha:** 50 × 39 + 90 × 12 = US$ 3.030.

Refazendo com as taxas reais do Lemon Squeezy (5% + US$ 0,50 por transação, mais
0,5% em assinatura e 1% de payout internacional para conta brasileira):

| Mix | Bruto | Taxas aprox. | Líquido aprox. |
|---|---|---|---|
| O do plano: 50 packs + 90 assinantes | US$ 3.030 | ~US$ 230 | **~US$ 2.800** |
| **Suficiente para a meta: 30 packs + 60 assinantes** | US$ 1.890 | ~US$ 145 | **~US$ 1.745** |
| 35 packs + 70 assinantes | US$ 2.205 | ~US$ 168 | **~US$ 2.037** |

**A meta de US$ 2.000 líquidos é atingível com cerca de 35 packs e 70
assinantes** — bem menos que o mix do plano original. Vale corrigir antes de
virar pressão de venda, porque a diferença entre 90 e 70 assinantes em 90 dias é
a diferença entre uma meta dura e uma meta impossível.

Afiliado custa 3% adicionais por indicação. Entra na conta na Fase 2.

---

## 6. Custo de operação

Levantado em 2026-09-09. **Custo fixo da Fase 1: US$ 0.**

| Serviço | Tier | Preço | Limite | Gatilho de upgrade |
|---|---|---|---|---|
| EulerStream | Community | **US$ 0** | 25 WebSockets simultâneos, 2.500 req/dia | Passar de 25 lives **simultâneas** → Business, US$ 50/mês |
| Supabase | Free | **US$ 0** | 500 MB, 50k MAU, 5 GB egress | Passar de 500 MB ou 5 GB/mês → Pro, US$ 25/mês |
| Lemon Squeezy | — | **sem mensalidade** | — | Só taxa por venda |
| Roblox | — | **US$ 0** | Roda na máquina do cliente | — |

O ponto que muda a modelagem: a API gerenciada cobra **conexão simultânea, não
assinante**. Streamers não ficam ao vivo todos ao mesmo tempo, então 25
WebSockets grátis cobrem uma base bem maior que 25 pessoas. **Nenhum custo de
infraestrutura dita o preço mínimo da assinatura.**

---

## 7. Internacionalização

Resumo; a decisão inteira está no [ADR-P03](../08_DECISOES/adr-p03-i18n-por-chave.md).

- Produto (painel, jogo, overlay, instalador, e-mails): **PT, ES, EN**, desde o
  primeiro commit da Fase 1
- Funil (landing, checkout, anúncio, conteúdo): **EN primeiro**, ES e PT na Fase 2
- Console do operador: **PT apenas, nunca traduz**
- Nome de presente da TikTok: **não traduz**

A dívida a pagar: existem hoje ~570 strings em português cravadas em 28
componentes React, mais o texto do HUD em Luau. O "nasce com chave" do plano
original chegou tarde — o primeiro commit da Fase 1 **é** o retrofit.

---

## 8. Riscos assumidos

1. **Não existe API oficial do TikTok para eventos de live.** A API gerenciada
   mitiga a **quebra técnica**; não mitiga os **termos**. Ver
   [ADR-P06](../08_DECISOES/adr-p06-uso-comercial-da-captura.md), que ainda
   aguarda decisão do dono. É o risco que pode encerrar o produto no mês 3.
2. **Suporte de software instalado em máquina alheia.** É o custo dominante do
   desenho do ADR-P04, e foi assumido conscientemente. Windows, antivírus,
   firewall, `HttpService` desligado.
3. **Barreira de entrada baixa.** Já existe modalidade escalada avulsa por cerca
   de US$ 50. O diferencial é catálogo, acabamento e setup, não o código — que,
   no desenho do Studio, vai junto com o produto e é legível pelo cliente.
4. **Foco.** Este plano só fecha com uma frente ativa. Kora Insights, Forge e
   Caos Diário ficam parados até a semana 12.
5. **Escopo do console.** É a parte que mais cresce sozinha. Mitigado pela
   fronteira congelada do [ADR-P05](../08_DECISOES/adr-p05-console-do-operador.md).
6. **Nada rodou fora do teste.** O risco mais imediato de todos, e o único que a
   Fase 0 existe para eliminar.

---

## 9. O que mudou em relação ao plano original

| # | O plano original dizia | Correção |
|---|---|---|
| 1 | "Cada cliente precisaria do próprio place" — argumento central para reescrever em web | Verdadeiro e **irrelevante**: cada cliente roda o próprio place no Studio dele, que é a topologia atual. O dono confirmou que é essa a intenção. Ver ADR-P04 |
| 2 | "Manter Roblox significa abrir mão da telemetria de produto" | Falso. Funil de setup e mapa de cliques vivem no painel, que é React nos dois cenários. Só a telemetria de dentro do jogo se perde, e ela não media nada |
| 3 | "Medir o custo da API gerenciada; esse número define o preço mínimo da assinatura" | Medido: **US$ 0**. EulerStream Community dá 25 WebSockets simultâneos de graça, e cobra simultaneidade, não assinante. Nenhum custo dita o preço |
| 4 | "Risco 1 mitigado pela API gerenciada" | Mitiga a quebra técnica, **não os termos**. O ADR-006 já dizia, desde 2026-09-01, que virar produto com mecanismo não oficial bloqueia essa fase. Virou o ADR-P06 |
| 5 | "~50 packs + ~90 assinantes = bruto de US$ 2.100" | Aritmética errada: são US$ 3.030. A meta é atingível com um mix menor, ~35 packs e ~70 assinantes. Ver seção 5 |

Além disso, a contradição interna entre a seção 5.1 ("banco deixa de ser
opcional") e a seção 8 ("banco de dados fora de escopo") foi resolvida no
ADR-P02: são dois dados com dois donos diferentes.

---

## 10. Fora de escopo neste ciclo

- Integração com Gemini para gerar mapa e ambiente além do que já existe
- Times, espectador com personagem próprio, qualquer modalidade além das três
- Experiência Roblox publicada pela Kora (registrada no ADR-P04 como caminho da
  Fase 3, se o público deixar de ser "streamer que já usa Studio")
- Multi-streamer no sentido de vários clientes num mesmo processo

---

## 11. Próximas ações

| # | Ação | Quem |
|---|---|---|
| 1 | ~~Fechar o ADR-P01~~ | ✅ feito, 2026-09-09 |
| 2 | ~~Escrever ADR-P02, P03, P04, P05~~ | ✅ feito, 2026-09-09 |
| 3 | ~~Listar os fixes mínimos da escalada~~ | ✅ [feito](../09_BACKLOG/fase-0-fixes-minimos.md) |
| 4 | ~~Levantar o custo por usuário conectado~~ | ✅ feito: US$ 0, seção 6 |
| 5 | **Ler e decidir o ADR-P06** — é o que pode matar os 90 dias | Dono |
| 6 | **Decidir o que fazer com o Estúdio de Overlay não commitado** | Dono |
| 7 | **Montar o acervo no Roblox** (F0-1) — bloqueia todo mapa | Dono |
| 8 | **Rodar no Studio pela primeira vez** (F0-2) | Dono |
| 9 | **Agendar a primeira live em inglês** | Dono |
