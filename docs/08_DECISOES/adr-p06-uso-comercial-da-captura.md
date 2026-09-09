# ADR-P06 — Uso comercial da captura não oficial: o que a API gerenciada resolve e o que não resolve

**Status**: **Proposto — aguarda decisão do dono** · **Data**: 2026-09-09
**Estende**: ADR-006 · **Relacionado**: ADR-P01, ADR-P04

> Este é o único ADR da série P que não está aceito. Ele descreve o risco que
> pode encerrar o produto no mês 3, e a decisão de assumi-lo é do dono, não
> minha. Está escrito para ser lido **antes** da primeira venda, não depois.

---

## Contexto

O plano de produto lista, como risco 1:

> "Não existe API oficial do TikTok para eventos de live. Tudo roda em acesso
> não oficial que quebra quando o TikTok muda. Cada quebra é churn. **Mitigado
> pela API gerenciada**, que tem custo por assinante."

A frase final está incompleta, e a diferença importa muito. **São dois riscos
distintos, e a API gerenciada só cobre um deles.**

| Risco | O que é | API gerenciada (EulerStream, TikTool) resolve? |
|---|---|---|
| **Quebra técnica** | O TikTok muda o protocolo do webcast e o conector para de funcionar | **Sim.** É exatamente o que se está comprando: alguém de plantão para consertar antes de você |
| **Termos de uso** | O acesso é não oficial, e agora está sendo revendido a terceiros | **Não. Em nada.** A EulerStream é o *mesmo* acesso não oficial, gerenciado por um terceiro. Um intermediário não confere licença |

E o repositório já sabia disso. O ADR-006, de 2026-09-01, escreveu:

> "Está numa zona cinzenta dos termos da TikTok. Uso pessoal e não comercial na
> Fase 1. **Não anunciar como produto enquanto for esse o mecanismo.**"
>
> "**Bloqueia a Fase 3 como está.** Virar produto para terceiros com um mecanismo
> não oficial expõe o Matheus e os usuários. A Fase 3 depende ou da via oficial
> ou de uma reavaliação formal."

O plano de produto é a Fase 3 antecipada para 90 dias. Ele passa por cima dessa
linha sem citá-la. **Este ADR é a reavaliação formal que o ADR-006 exigiu.**

---

## O que mudou desde o ADR-006, e o que não mudou

### Melhorou

- **O ADR-P04 tirou a Kora do meio da conexão.** No desenho do Studio, quem
  conecta na live é o software rodando na máquina do cliente, com a conta do
  próprio cliente, na live do próprio cliente. A Kora vende a ferramenta; não
  opera a captura, não armazena o stream, não intermedia o acesso. É a diferença
  entre vender uma ferramenta e prestar um serviço de coleta — e é uma diferença
  que costuma importar.
- **A fronteira do Roblox está resolvida**, também pelo ADR-P04: o que se vende
  é software local, não recurso de dentro de uma experiência. **Isso só continua
  verdade enquanto nenhuma licença destravar conteúdo dentro do place.** A regra
  está escrita no ADR-P04 e vale para toda modalidade futura.
- **A LGPD segue coberta**: nada de espectador é retido além da sessão, e log de
  evento nunca carrega identificador persistente junto de nickname
  (`CLAUDE.md`, `docs/11_SEGURANCA`). A telemetria do ADR-P02 herda a mesma
  regra, e errar nela custa mais caro por ser tabela remota.

### Não mudou

- O acesso continua **não oficial**. Nenhum contrato, nenhuma permissão,
  nenhuma garantia.
- Passa a haver **dinheiro em cima dele**, o que muda o tom de qualquer conversa
  futura com a plataforma.
- Passa a haver **terceiros dependendo dele**. Se cair, não é a live do dono que
  para: são as lives de todos os clientes pagantes, no mesmo minuto.
- Entra **uma dependência a mais**: a própria EulerStream é um terceiro cujo
  acesso também pode ser cortado. A cadeia fica Kora → EulerStream → TikTok, e a
  Kora não controla nenhum dos dois elos finais.

---

## Decisão proposta

**Assumir o risco na Fase 1, com as cinco mitigações abaixo obrigatórias, e
abrir a candidatura ao programa oficial de parceiro de jogo da TikTok em
paralelo, na semana 3 — não depois.**

A alternativa honesta a isso é não vender. Não existe terceira via em que o
risco desaparece.

### Mitigações obrigatórias

1. **A interface de evento normalizado continua sagrada.** Todo contato com
   captura fica em `bridge/src/tiktok/`. Trocar para a via oficial é reescrever
   um diretório, e essa propriedade é o que compra tempo se a via oficial sair.
   Já é assim; passa a ser requisito contratual do produto.
2. **Nunca anunciar como integração oficial da TikTok.** Nem "oficial", nem
   "parceiro", nem logo da TikTok na landing. A comunicação é "conecta na sua
   live", nunca "API oficial".
3. **Termo de uso do cliente**, na Fase 1, dizendo em português claro que a
   disponibilidade depende de plataforma de terceiro e pode ser interrompida.
   Sem isso, a primeira quebra vira pedido de reembolso com razão.
4. **O alarme de saúde de conexão do console v1** (ADR-P05, item 6) é
   inegociável. A Kora precisa saber da quebra antes dos clientes.
5. **Política de quebra escrita antes de acontecer**: o que a Kora faz com a
   assinatura quando o serviço fica dias fora. Pausar a cobrança é mais barato
   que devolver e perder o cliente, e decidir isso no calor da quebra é decidir
   errado.

### Gatilho de reavaliação

Este ADR volta à mesa, com o produto pausado, se:

- Chegar qualquer comunicação da TikTok, formal ou automática, sobre o uso.
- A EulerStream perder o acesso ou encerrar o serviço.
- A candidatura oficial for aceita — aí o mecanismo troca e este ADR é
  supersedido por um bem mais tranquilo.

---

## Alternativas consideradas

### 1. Esperar a via oficial antes de vender
- **Prós**: risco resolvido de verdade. É o que o ADR-006 recomendava.
- **Contras**: processo de aprovação, requisitos de audiência e prazo incerto —
  possivelmente muito além de 90 dias. Na prática, é adiar o produto sem data.
- **Descartado porque**: mata o plano. Mas fica registrado como o caminho certo
  em um mundo com mais tempo, e é por isso que a candidatura entra em paralelo.

### 2. Vender só a ferramenta, sem nenhuma captura, e o cliente que se vire
- **Descartado porque**: a captura é o produto. Sem ela, o que sobra é um obby.

### 3. Assumir o risco sem mitigação, e correr
- **Descartado porque**: as cinco mitigações custam pouco e cada uma delas evita
  um modo de falha diferente. Pular a nº 3 e a nº 5 é o que transforma uma
  quebra técnica em chargeback.

---

## Consequências

### Se aceito
- O plano de 90 dias segue como está, com o risco nomeado e um plano de
  contingência escrito.
- Custo: o tempo das mitigações — termo de uso, política de quebra e a
  candidatura. Menos de uma semana somada.

### Se recusado
- A Fase 1 não vende, e o plano vira o que o ADR-006 já dizia: usar em live
  própria e esperar a via oficial.
- A Fase 0 acontece do mesmo jeito. Ela não vende nada, e o valor dela — saber
  se o jogo aumenta presente — continua valendo em qualquer cenário.

---

## Referências
- [ADR-006](./adr-006-captura-nao-oficial.md) — a decisão que este estende, e o aviso que ela deixou
- [ADR-P04](./adr-p04-distribuicao-em-roblox.md) — por que a Kora não fica no meio da conexão
- [ADR-P05](./adr-p05-console-do-operador.md) — o alarme de saúde de conexão
- `memory/restrictions.md` — restrições legais registradas
- `docs/00_VISAO/plano-de-produto.md`, seção 7 — o risco como o plano o descreveu
