# Contrato da onda 2

Escrito pelo maestro **antes** de despachar as frentes, e commitado. As duas
frentes partem deste commit e constroem contra o que está aqui. Ninguém inventa
forma de dado no meio do caminho, que é a lição do BUG-001: contrato existe para
ser testado dos dois lados.

Vale só para esta onda. O que estiver aqui e sobreviver vira documento de
verdade em `docs/07_APIS/` na integração.

---

## 1. Fronteiras

| Frente | Dona exclusiva de | Não toca |
|---|---|---|
| `console` | `console/**` | tudo o mais |
| `produto` | `app/**`, `scripts/**` | `console/`, `bridge/`, `panel/` |
| maestro | `package.json`, `data/supabase/**`, `docs/`, `.full-auto/`, `.env*` | |

Frente que precisar de mudança em arquivo compartilhado pede no relatório. O
maestro aplica antes de integrar.

---

## 2. O banco já existe, e é ele que manda

O SQL é do maestro e está escrito: `data/supabase/001-esquema.sql` (licença e
telemetria, já em uso pela ponte) e `data/supabase/002-console.sql` (o que o
console precisa). **Nenhuma frente escreve SQL.** Se faltar coluna, pede.

Tabelas e visões que o console lê, com os nomes reais em `snake_case`, porque é
como o PostgREST devolve:

- `assinantes`: `streamer_id`, `email`, `usuario_tiktok`, `nome`, `idioma`,
  `lemon_customer_id`, `criado_em`, `atualizado_em`
- `licencas`: `chave`, `streamer_id`, `estado`, `plano`, `valida_ate`,
  `criada_em`, `atualizada_em`
- `telemetria`: `id`, `streamer_id`, `tipo`, `em`, `recebida_em`,
  `versao_instalada`, `idioma`, `modalidade`, `motivo`
- `log_administrativo`: `id`, `operador`, `acao`, `streamer_id`, `detalhe`, `em`
  (**append-only por trigger**: `update` e `delete` levantam exceção)
- `faturamento`: `evento_id`, `tipo`, `streamer_id`, `plano`, `valor_centavos`,
  `moeda`, `em`, `recebido_em`, `bruto`
- `ficha_do_assinante` (visão): a ficha do item 2 montada num momento só do
  banco, com `ultima_conexao`, `versao_instalada` e `modalidades` já agregados
- `saude_de_conexao` (visão, do 001): o item 6

**Dinheiro é inteiro, em centavos**, com a moeda ao lado. Nunca ponto flutuante.

---

## 3. A camada de dados do console

Uma interface, duas implementações, escolhidas por configuração. O console
inteiro fala só com a interface e nunca sabe qual está ligada.

```
console/src/dados/
  index.js          escolhe a implementação e reexporta
  contrato.js       a interface, documentada, e nada mais
  supabase.js       a real, por REST, com a chave de SERVIÇO
  exemplo.js        a falsa, com dado de exemplo realista
```

Regra de escolha, e ela é uma só: **sem `SUPABASE_URL` ou sem a chave de
serviço, vale a falsa.** Nada de flag separada para ligar mock, porque flag
separada é como se esquece o mock ligado em produção.

As funções, todas assíncronas, todas devolvendo dado já em português de domínio
(quem traduz `snake_case` do banco para o domínio é `supabase.js`, e é a única
que conhece o banco):

| Função | Devolve | Serve a |
|---|---|---|
| `listarAssinantes({ busca, limite, cursor })` | `{ assinantes: [...], proximo }` | item 1 |
| `buscarFicha(streamerId)` | a ficha, ou `null` | item 2 |
| `trocarPlano(streamerId, plano, { motivo })` | a ficha atualizada | item 3 |
| `resumoDeFaturamento({ mes })` | `{ mrrCentavos, moeda, vendas, cancelamentos, serie }` | item 4 |
| `listarEventos({ streamerId, desde, limite })` | `{ eventos: [...] }` | item 5 |
| `listarAcoesAdministrativas({ desde, limite })` | `{ acoes: [...] }` | item 5 |
| `saudeDeConexao()` | `{ conectadosAgora, quedas24h, serie }` | item 6 |
| `registrarAcao({ acao, streamerId, detalhe })` | a ação gravada | item 3, e toda ação futura |

`busca` do item 1 casa com **usuário da TikTok, e-mail ou chave de licença**,
sem o operador precisar dizer qual dos três está digitando.

**Erro nunca vira exceção solta.** Toda função devolve `{ ok: false, motivo }`
quando não deu, no mesmo espírito do `bridge/src/repos/supabase.mjs` que já
existe: quem chama precisa distinguir "o banco respondeu" de "não deu para
perguntar", e exceção é o jeito errado de dizer a segunda.

---

## 4. O adaptador da Lemon Squeezy

```
console/src/faturamento/
  contrato.js
  lemon.js       a real, com LEMON_API_KEY
  exemplo.js     a falsa, ativa por padrão
```

- `trocarPlano(lemonCustomerId, plano)`
- `assinaturaDe(lemonCustomerId)`

Mesma regra de escolha: sem `LEMON_API_KEY`, vale a falsa. A falsa **registra a
ação no log administrativo do mesmo jeito que a real**, senão o teste do item 5
passaria por acidente.

O webhook não mora no console: ele é uma função de borda do Supabase
(`data/supabase/borda/lemon-webhook/`), decidida em D05, porque a ponte roda na
máquina do cliente e não pode receber webhook. Ela grava em `faturamento` com
`on conflict (evento_id) do nothing`, porque webhook reenvia e reenvio virando
linha nova duplicaria a venda no MRR.

---

## 5. O console é uma superfície da Kora, não do cliente

- **Português apenas, e nunca traduz** (ADR-P05). Nada de i18n, nada de chave.
  Cada string traduzida ali é trabalho gasto em plateia de uma pessoa.
- **A chave de serviço nunca chega ao navegador.** Ela ignora RLS. O console
  roda local, como o painel, e lê a chave do processo, nunca de
  `import.meta.env.VITE_*`, que vai para o bundle e é público por definição.
- **Nada de editar jogo ou animação pelo console.** Isso é painel do cliente, e
  misturar as duas superfícies é como o console vira um segundo produto.
- Cores e espaçamentos saem dos mesmos tokens do produto
  (`data/tokens.json`), para não nascer um segundo design system.

---

## 6. Como cada frente prova que terminou

Sem prova, a tarefa não fecha. O critério de cada uma está no
`.full-auto/TAREFAS.md`; o mínimo comum é:

1. `node --test` dos próprios testes, verde.
2. A tela aberta de verdade num navegador, com o que ela mostra descrito no
   relatório. **Teste estático não sabe o que a tela desenha**, que é a lição do
   BUG-008: 504 testes passavam com o painel quebrado.
3. O relatório diz, explicitamente, o que ficou mockado e o que não foi
   verificado.
