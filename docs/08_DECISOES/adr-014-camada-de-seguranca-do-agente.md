# ADR-014 — Camada de segurança do agente que escreve o código

- **Status:** aceito
- **Data:** 2026-09-14
- **Contexto:** CLAUDE.md (Segurança e Custo), `docs/11_SEGURANCA`,
  `memory/restrictions.md` (bootstrap gratuito)

## Contexto

`docs/11_SEGURANCA` cobre o que o **código** precisa ter: token na superfície
pública, segredo só no `.env`, validação de payload, retenção zero de dado de
espectador. Nada ali cobre o que o **agente que escreve esse código** tem em
volta dele.

O problema é o de sempre, e vale igual para humano e para IA: quem escreveu não
é bom revisor do próprio texto. Este repositório é escrito majoritariamente por
agente, em rodadas longas, e a única revisão até aqui era a leitura do dono no
fim. Falta um revisor que não participou da escrita, e falta um portão antes de
instalar qualquer coisa de terceiro dentro de `.claude/`.

Skill e plugin de terceiro são código que roda com o contexto inteiro do
projeto na mão: o `.env` está no disco, a chave do Gemini está no processo, e o
token da ponte está no arquivo que o botão do Studio gera. Instalar um sem
olhar é dar essa superfície de graça.

## Decisão

**A camada de segurança do agente tem três peças, e só entra nela o que não
gera cobrança nova.**

| # | Ferramenta | Origem | Papel |
|---|---|---|---|
| 1 | `security-guidance` | Anthropic, oficial | Revisa a mudança que o próprio agente acabou de fazer: regex no edit, review do diff no fim do turno, review agêntico no commit |
| 2 | `SkillSpector` | NVIDIA, Apache 2.0 | Portão antes de instalar skill ou plugin de terceiro: prompt injection, exfiltração, supply chain. Modo estático, sem chave de LLM |
| 3 | `VibeSec-Skill` | BehiSecc, comunidade | Contexto de código seguro para o agente: IDOR, XSS, SSRF, injeção, JWT, mass assignment |

`security-guidance` é instalado em **escopo de usuário**, para valer em todo
projeto sem reinstalar. Kill switch por projeto: `SECURITY_GUIDANCE_DISABLE=1`.

### Correção sobre custo, medida na instalação

O material de origem diz que o `security-guidance` é "grátis em todos os planos".
Isso é verdade sobre **cobrança**, não sobre **consumo**. Lendo o código
instalado (`hooks/llm.py`): o review do diff e o review de commit fazem chamada
real a `api.anthropic.com`, autenticada com o token da assinatura, e o modelo
padrão é `claude-opus-4-7`. Não chega fatura nova; consome cota do plano.

Isso não muda a decisão, e muda o que está escrito: das três peças, só o
SkillSpector no modo estático e o VibeSec são consumo zero. A diferença para as
ferramentas que ficaram de fora continua de pé — `strix` e `claude-security`
exigem chave própria ou Docker e geram custo **novo**, fora do plano.

Duas alavancas ficam registradas para quando a cota apertar:
`SECURITY_REVIEW_MODEL` troca o modelo do review, e `SG_DUAL_OR` (padrão
desligado) dobraria o custo por review se fosse ligado. Manter desligado.

## Alternativas consideradas

**`claude-security` (Anthropic) e `strix` (usestrix).** Ficam **de fora**.
Ambos são gratuitos de instalar e nenhum dos dois é gratuito de rodar: cada
varredura consome token de verdade, e o `strix` ainda exige Docker e chave
própria de LLM. Isso bate de frente com `memory/restrictions.md`, que adia por
padrão toda implementação que exija investimento. Entram por decisão explícita
do dono, em ADR próprio, e o gatilho natural é a auditoria antes do primeiro
cliente pagante — que na trilha deste projeto é a Fase 3.

**Plugins da `trailofbits/skills`** (`differential-review`, `static-analysis`,
`sharp-edges`, `agentic-actions-auditor`). Gratuitos, mas o catálogo é
majoritariamente smart contract, C e Rust. A stack aqui é Node, React e Luau:
o custo de contexto não se paga.

**`trailofbits/skills-curated` como marketplace curada.** Resolve o mesmo
problema do SkillSpector por curadoria em vez de varredura. Redundante enquanto
este projeto instalar skill de terceiro raramente, que é o caso hoje.

**Não ter camada nenhuma e confiar na leitura do dono.** É o estado anterior.
Funciona para o erro que aparece na tela e falha exatamente onde dói: segredo
que vaza para o log, payload que ninguém validou, skill de terceiro que lê o
`.env` no primeiro turno.

## Consequências

- Todo `git commit` passa pelo revisor agêntico do `security-guidance`. Ele
  atrasa o commit, não a live: nada disto toca o caminho crítico do presente
  (CLAUDE.md, Princípio nº1), que é o Roblox falando com a ponte em produção.
- **Nenhuma skill ou plugin de terceiro entra sem `skillspector scan` limpo
  antes.** Vira restrição permanente, registrada em `memory/restrictions.md`.
  Plugin publicado pela própria Anthropic na marketplace oficial é a única
  exceção.
- A camada não gera cobrança nova, o que a mantém dentro do bootstrap gratuito.
  O `security-guidance` consome cota do plano por review; os outros dois são
  consumo zero.
- Ferramenta que exija chave própria, Docker ou fatura separada é decisão do
  dono, nunca default.

## O que isto NÃO cobre

As três ferramentas pegam injeção, XSS, desserialização insegura, segredo
hardcodado. Nenhuma delas valida **isolamento entre tenants**: uma regra de
acesso mal escrita que deixa o streamer A ler a sessão do streamer B passa
batido por todas.

Isso importa aqui mesmo sendo single-tenant hoje. O `streamerId` já nasce em
todo modelo persistido (ADR-003) justamente porque a Fase 3 é multi-tenant, e é
lá que a falha apareceria. A checagem de isolamento continua **manual e
obrigatória**, conforme `docs/11_SEGURANCA`. Ferramenta não substitui esse
teste.

## O que a primeira varredura devolveu

O SkillSpector foi usado no que ele existe para fazer, antes de o VibeSec entrar
no projeto. As duas varreduras estáticas deram `DO_NOT_INSTALL`, e as duas são
**falso positivo pela mesma razão**: ferramenta que procura padrão de ataque,
apontada para documentação sobre ataque, casa com os exemplos.

| Alvo | Score | Achados | Leitura |
|---|---|---|---|
| `VibeSec-Skill` | 95, CRITICAL | 6 HIGH, 2 MEDIUM | `rm -rf /` numa tabela sobre injeção em nome de arquivo, `/etc/passwd` num exemplo de ZIP slip, "access tokens" num parágrafo sobre revogação |
| `security-guidance` 2.0.8 | 100, CRITICAL | 1 CRITICAL, 24 HIGH, 54 MEDIUM | 81 dos 82 são o corpus de regras do próprio plugin e as fixtures de teste. O CRITICAL é a chamada de rede de `hooks/llm.py`, que vai para `ANTHROPIC_BASE_URL` (padrão `api.anthropic.com`) e é a função do plugin |

O VibeSec foi conferido à mão antes de entrar: três arquivos, nenhum script
executável, nenhum `allowed-tools`, nenhum caractere unicode invisível, e as
únicas URLs são exemplos de bypass de SSRF dentro do texto.

Os 8 achados do VibeSec estão suprimidos em
`.claude/skills/vibesec/.skillspector-baseline.yaml`, com o motivo escrito
dentro do arquivo. O baseline é versionado de propósito: ele faz a próxima
varredura reportar só o que for **novo**, que é o caso que importa quando a
skill for atualizada.

**A lição fica:** score de varredura estática não é veredito. Ele é o começo da
leitura, e o que decide é olhar o achado. Reprovar por score seria o mesmo erro
que aprovar sem ler.

## Referências

- `docs/11_SEGURANCA/README.md`, seção "Camada 6"
- `memory/patterns.md`, padrão "o agente também é revisado"
- `memory/restrictions.md`, restrição do portão de skill de terceiro
- ADR-003 — `streamerId` desde já, multi-tenant na Fase 3
