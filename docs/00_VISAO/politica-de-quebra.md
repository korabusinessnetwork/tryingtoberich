# Política de quebra

**Mitigação nº 5 do ADR-P06.** Escrita em 2026-09-10, **antes** de a primeira
quebra acontecer, e essa é a única razão de ela existir:

> "Pausar a cobrança é mais barato que devolver e perder o cliente, e decidir
> isso no calor da quebra é decidir errado."

O risco número 1 do produto é o acesso à live da TikTok parar de funcionar. Não
é hipótese remota: o acesso é não oficial, sem contrato e sem aviso prévio. Vai
acontecer. O que decide o estrago não é a quebra, é o que a Kora faz na hora.

---

## Quem decide que quebrou, e a partir de quando conta

**O relógio começa quando a Kora confirma a interrupção, não quando o primeiro
cliente reclama.** É para isso que existe o item 6 do console (ADR-P05), o
alarme de saúde de conexão, e é por isso que ele foi chamado de inegociável.

O alarme distingue duas coisas que parecem iguais no gráfico:

| O que se vê | O que é | O que fazer |
|---|---|---|
| Quedas espalhadas pelo dia, clientes diferentes voltando sozinhos | internet de streamer | nada |
| Três ou mais quedas concentradas numa hora, ou todo mundo caído e ninguém voltando | a plataforma | **abre a política** |

---

## Os quatro degraus

Cada um tem um gatilho de tempo, uma ação e um responsável. Nenhum depende de
alguém lembrar de fazer.

### Até 24 horas: consertar, e só

- **Cobrança:** não muda.
- **Comunicação:** nenhuma proativa. Quem escrever recebe resposta honesta.
- **Por quê:** interrupção curta acontece e se conserta. Anunciar cada soluço
  treina o cliente a duvidar do produto.

### Passou de 24 horas: pausar a cobrança, sem pedir

- **Cobrança:** pausada. O cliente não paga pelos dias em que não funcionou.
- **Comunicação:** e-mail dizendo o que houve, que a cobrança já está pausada e
  que ninguém precisa fazer nada.
- **Por quê:** é aqui que a política se paga. Cliente que descobre sozinho que
  foi cobrado por um serviço fora do ar não pede pausa, pede chargeback, e
  chargeback custa o dinheiro, a taxa e a conta de pagamento.

### Passou de 7 dias: o cliente escolhe

Duas opções, ditas nas duas frases mais curtas possíveis:

1. **Continuar pausado**, esperando, sem pagar nada.
2. **Cancelar** e receber de volta a parte proporcional do ciclo já pago.

- **Por quê:** depois de uma semana sem produto, insistir em segurar o cliente é
  o que transforma um problema técnico em reputação ruim. Quem sai com o
  dinheiro de volta volta depois; quem sai brigando não.

### Definitivo: encerrar e devolver

Vale quando o acesso é cortado de vez, ou quando a TikTok comunica que o uso não
é permitido.

- **Cobrança:** encerrada. Parte proporcional devolvida.
- **Comunicação:** e-mail dizendo o que aconteceu, sem eufemismo, e o que fazer
  com os arquivos, que continuam do cliente.
- **Produto:** o portátil e o instalado **continuam abrindo**. O que para de
  funcionar é a live; o preset, o mapa e o histórico continuam lá. Um programa
  que se recusa a abrir depois de o serviço acabar é o que faz o cliente sentir
  que perdeu o que era dele.

---

## O que NÃO fazer, e cada linha aqui é um erro que alguém já cometeu

- **Não prometer prazo de conserto.** A Kora não controla a TikTok nem a
  EulerStream. Prometer "volta amanhã" e não voltar custa mais que o silêncio.
- **Não continuar cobrando esperando resolver rápido.** É o caminho para o
  chargeback, e o chargeback é mais caro que a mensalidade.
- **Não desligar o programa do cliente.** Ver o degrau definitivo.
- **Não sumir.** O e-mail de 24 horas é o mais barato da lista e o que mais
  segura cliente.
- **Não chamar de manutenção programada.** É quebra, e o cliente descobre.

---

## O que precisa existir antes da primeira venda

A política acima só funciona se estas quatro coisas estiverem prontas, e três
delas já estão:

| | Estado |
|---|---|
| O alarme de saúde de conexão no console (ADR-P05, item 6) | **feito** |
| O termo de uso dizendo isso ao cliente, item 4 (`scripts/modelos/termo-de-uso.txt`) | **feito** |
| A regra do alarme distinguir internet de streamer de queda de plataforma | **feita**, em `console/src/lib/alarme.js`, testada |
| O botão de pausar a assinatura na Lemon Squeezy | **falta**, depende da conta |

---

## Gatilho de revisão

Esta política volta à mesa quando o ADR-P06 voltar, e ele tem gatilho próprio:
qualquer comunicação da TikTok, a EulerStream perder o acesso, ou a candidatura
ao programa oficial ser aceita. No terceiro caso, esta política encolhe: com a
via oficial, a quebra deixa de ser questão de quando.
