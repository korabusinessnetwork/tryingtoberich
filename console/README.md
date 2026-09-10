# Console do operador

A superfície interna da Kora (ADR-P05). Não é produto, não é do cliente, e não
sai da máquina de quem opera.

```
npm run console      # sobe em http://127.0.0.1:5273
```

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

## Testes

```
node --test "console/test/**/*.test.mjs"
```

`test/telas.test.mjs` RENDERIZA os componentes. Isso existe por causa do
BUG-008: 504 testes verdes conviveram com o painel quebrado porque nenhum deles
renderizava. Tela nova nasce com pelo menos um teste que monta o componente e
lê o texto que sai, e nenhum teste substitui abrir a tela no navegador.
