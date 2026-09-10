# Relatório final: Kora Stream Games, Fase 1

## Resumo

O produto saiu de "roda na minha máquina com dois terminais" para **um programa
que instala e se atualiza sozinho**, com a camada da Kora (licença, telemetria,
saúde de conexão) de pé contra um Supabase real, e o console do operador
completo nos seis itens que o ADR-P05 congelou.

Os dezesseis ADRs de fundação e os oito de produto estão implementados. O que
falta para vender não é código: é uma decisão sua (ADR-P06) e uma conta na
Lemon Squeezy.

## Como rodar

```
npm start
```

E o produto empacotado, que é o que o cliente recebe:

```
npm run empacotar
```

O console do operador, que é da Kora e não do cliente: `npm run console`.

## O que está pronto

| | Verificado com |
|---|---|
| **Aplicativo portátil**, janela nativa, sem console preto | montado e aberto do zero: painel em 200, porta do jogo em 401 sem token |
| **Instalador**, sem pedir administrador | instalado em silêncio numa pasta de teste, rodado, e desinstalado |
| **O dado do streamer sobrevive ao desinstalador** | 56 arquivos e o `.env` continuaram no perfil depois de desinstalar |
| **Atualização automática** | fiada e configurada; falha em silêncio sem servidor, que é o comportamento desejado hoje |
| **Licença com carência de 14 dias** (ADR-P02, ADR-P08) | ativada e recusada contra o Supabase real, pela tela |
| **Telemetria fire-and-forget** | as linhas chegaram no Supabase sozinhas; a ficha do console lê a versão instalada delas |
| **RLS**: o cliente não alcança o que é da Kora | a chave anon foi recusada nas cinco superfícies, e não consegue escrever em `licencas` |
| **Log administrativo imutável** | `update`, `delete` e `truncate` recusados no banco de verdade |
| **Console v1, seis itens** | aberto no navegador com dado real; busca, ficha e troca de plano exercitadas contra o Postgres |
| **Erro traduzido nos três idiomas** | resposta real da ponte virando frase em pt, es e en com o valor preservado |
| **Nada da Kora no caminho do presente** | maratona com a camada ativa: p95 de **2 ms** num orçamento de 1000 ms |

**764 testes verdes**, contratos e Luau validados.

## O que está mockado ou local

| Parte | Contorno | Pendência |
|---|---|---|
| **Lemon Squeezy** | Adaptador falso ligado por padrão. Ele registra a ação no log administrativo igual ao real, e o log anota que a cobrança **não** foi escrita, em vez de fingir. | P05 |
| **`console/src/faturamento/lemon.js`** | Escrito a partir da documentação pública deles. **Nunca rodou contra a API.** | P05 |
| **Webhook do faturamento** | Escrito e testado, nunca publicado. Sem ele a tabela `faturamento` fica vazia e o número do mês é zero, que é verdade e não erro. | P05 |
| **Catálogo de planos** (`mensal`, `anual`, `cortesia`) | Fixo em `console/src/faturamento/contrato.js`. | P05 |
| **O portão da licença** | Existe, testado, e **desligado**: nenhuma funcionalidade consulta o veredito. | P01 |

## Suas pendências, em ordem

1. **P01, decidir o ADR-P06.** 20 minutos de leitura. Não bloqueia construir, bloqueia faturar.
2. **P02, a sessão no Roblox Studio.** Uma hora, roteiro pronto. Responde se o túnel some do produto.
3. **P04, deixar o `/ciclo` invocável.** Fiz o ciclo à mão a execução inteira.
4. **P05, a conta na Lemon Squeezy.** Depende da P01.
5. **P06, publicar o primeiro release** com o Setup **e** o `latest.yml`. É o que liga a atualização automática.
6. **P07 a P10**: o `claude.exe` incompatível, a carência de 14 dias, o skybox e a assinatura de código.

Tudo com passo a passo em `PENDENCIAS-DO-MATHEUS.md`.

## Decisões principais

- **D01** A execução ficou na sua branch, não numa `full-auto/`.
- **D02** Os hooks rodam com `.claude/hooks/` marcado como CommonJS, senão morriam em `require is not defined`.
- **D03** Ciclo feito à mão, sem a skill `/ciclo`.
- **D05** O webhook virou função de borda do Supabase: a ponte roda na máquina do cliente e não tem endereço público.
- **D06** O console nasce com adaptador falso ligado, pela única regra que não dá para esquecer ligada: sem chave, vale a falsa.
- **A decisão do dinheiro:** o número do faturamento é **receita cobrada no mês**, não projeção da carteira, porque a projeção não é calculável com o que a tabela guarda. O rótulo na tela é "Recebido em \<mês\>" e nunca "MRR".

Lista completa em `DECISOES.md`.

## Bloqueios

Nenhum. Nada ficou `[!]`.

## Verificação final

- **Instalação limpa das dependências:** `npm install` refeito na integração de cada onda.
- **Build:** os dois executáveis montados do zero, 96,3 e 96,5 MB.
- **Testes:** 764 de 764.
- **Fluxo principal testado à mão:** sim. O portátil aberto do zero, o instalador instalado e desinstalado, a licença ativada pela tela contra o Supabase, o console navegado com dado real, e a troca de plano feita e desfeita com as duas linhas no log imutável.

**O que eu NÃO consegui verificar, e é honesto dizer:**

- **O jogo em si.** Nada disto rodou dentro do Roblox Studio. A torre subindo, o Tween pousando na plataforma e o HUD lido no celular continuam sendo a pendência P02, e nenhum teste substitui.
- **As telas de falha do console** (base fora do ar, timeout) só foram exercitadas por teste renderizando, nunca no navegador.
- **A troca de aba do console no navegador.** Vi a tela de assinantes com dado real; as outras três verifiquei pelas rotas que elas renderizam, porque o clique de aba não respondeu nesta sessão do navegador.
- **A atualização automática nunca baixou nada**, porque não há release publicado. O que está provado é que ela não trava o arranque e falha em silêncio.

## Próximos passos sugeridos

1. **A sessão no Studio.** É a única coisa que separa o produto de "provado ponta a ponta", e ela destrava a decisão do túnel.
2. **Decidir o ADR-P06**, que é o que libera montar a cobrança de verdade.
3. **A refatoração do layout do painel**, registrada em
   `docs/09_BACKLOG/refatoracao-do-layout.md` a seu pedido. Ela pede uma live de
   verdade antes de qualquer desenho, e a sessão no Studio é a oportunidade.
