# Console do operador

A superfície interna da Kora (ADR-P05). Não é produto, não é do cliente, e não
sai da máquina de quem opera.

```
npm run console      # sobe em http://127.0.0.1:5273
```

## As quatro telas, e os seis itens do ADR-P05

| Aba | Itens do v1 | O que responde |
|---|---|---|
| Assinantes | 1, 2 e 3 | quem são, a ficha de cada um e a troca de plano |
| Faturamento | 4 | recebido no mês, vendas e cancelamentos |
| Logs | 5 | ação administrativa (imutável) e evento de telemetria |
| Saúde de conexão | 6 | conectados agora e quedas em 24h, como **alarme** |

Os itens 2 e 3 não têm aba: a ficha abre pela lista, e a troca de plano acontece
dentro dela. Aba para cada um daria seis entradas onde há quatro telas.

## Duas coisas que o número da tela quer dizer

**O valor grande do faturamento é RECEITA COBRADA no mês, não projeção da
carteira.** Um plano anual entra inteiro no mês em que foi cobrado, então esse
número não é taxa mensal corrente. A escolha e o porquê estão em
`src/dados/exemplo.js`, em `resumirFaturamento`, e a própria tela diz isso ao
operador: a tabela `faturamento` guarda eventos de cobrança, não assinaturas
vivas com preço, então a projeção não é calculável com o que existe hoje.

**A saúde de conexão é alarme, não gráfico.** A regra que decide entre calmo,
atenção e alarme é uma função pura em `src/lib/alarme.js`, testada nos dois
sentidos: quedas espalhadas pelo dia são a vida normal de quem transmite de
casa; quedas juntas na mesma hora, em instalações diferentes, é a plataforma.

## O que ele é, em três linhas

- **Seis itens, e só eles.** A fronteira do v1 está congelada no ADR-P05. Item
  novo só entra com "qual operação fica impossível sem ele" escrito.
- **Português apenas, e nunca traduz.** Sem i18n, sem chave de tradução. O
  console tem um usuário e ele é brasileiro. `test/invariantes.test.mjs`
  reprova qualquer i18n que entre aqui.
- **Nada de editar jogo ou animação por aqui.** Isso é painel do cliente, e
  misturar as duas superfícies é como o console vira um segundo produto.

## A chave de serviço, que é a decisão que molda o resto

`SUPABASE_SERVICE_KEY` ignora RLS e alcança a lista de assinantes com e-mail.
Ela **nunca** pode chegar ao navegador, e o caminho pelo qual ela iria é
`import.meta.env.VITE_*`, porque o bundle do Vite é público por definição.

Por isso o console tem dois lados:

| Onde | O que roda | Quem lê a chave |
|---|---|---|
| Node (servidor do Vite) | `src/dados/`, `servidor/rotas.js` | sim |
| Navegador | `src/App.jsx`, `src/components/`, `src/lib/` | nunca |

O navegador fala com `/api` da própria origem, e quem responde é
`servidor/rotas.js`. É a mesma topologia do painel com a ponte.

## As duas implementações da camada de dados

```
src/dados/
  contrato.js   a interface, documentada, e nada mais
  supabase.js   a real, por REST, com a chave de serviço
  exemplo.js    a falsa, com dado de exemplo realista
  index.js      escolhe e reexporta
```

**Regra de escolha, e é uma só: sem `SUPABASE_URL` ou sem `SUPABASE_SERVICE_KEY`,
vale a falsa.** Nada de flag separada para ligar o mock, porque flag separada é
como se esquece o mock ligado em produção.

Hoje a chave não existe, então a base falsa está ligada, e a pastilha no canto
superior da tela diz **Dado de exemplo** em toda tela que o operador abrir.

## O adaptador da Lemon Squeezy

```
src/faturamento/
  contrato.js   a interface, o catálogo de planos e o verbo do log
  lemon.js      o real, com LEMON_API_KEY. NUNCA rodou contra a API deles
  exemplo.js    o falso, ativo por padrão
  index.js      escolhe
  troca.js      o item 3: a única operação que escreve em DOIS sistemas
```

**Mesma regra de escolha: sem `LEMON_API_KEY`, vale o falso.** E o falso grava
no log administrativo igual ao real, senão o teste do item 5 passaria por
acidente.

A ordem da troca de plano é Lemon Squeezy primeiro, base da Kora depois, e
recusa da cobrança aborta a troca inteira. Ficha dizendo "anual" enquanto lá
continua cobrando mensal é ficha que mente para quem atende, e o cliente
descobre pela fatura.

**O que falta antes da primeira venda:** o adaptador real precisa de
`LEMON_VARIANTE_MENSAL` e `LEMON_VARIANTE_ANUAL` no `.env` (o `variant_id` de
cada plano no catálogo deles) e de uma rodada contra a API de verdade. Sem a
variante, a troca não sai e a tela diz por quê: chutar um id mudaria o plano do
cliente para o produto errado.

## Testes

```
node --test "console/test/**/*.test.mjs"
```

`test/telas.test.mjs` RENDERIZA os componentes. Isso existe por causa do
BUG-008: 504 testes verdes conviveram com o painel quebrado porque nenhum deles
renderizava. Tela nova nasce com pelo menos um teste que monta o componente e
lê o texto que sai, e nenhum teste substitui abrir a tela no navegador.
