# Spec — F0-3: painel e ponte juntos, no navegador

**Rodada:** 6 do ciclo de produto · **Data:** 2026-09-09
**Origem:** `F0-3` em [`docs/09_BACKLOG/fase-0-fixes-minimos.md`](../docs/09_BACKLOG/fase-0-fixes-minimos.md)

---

## Por que esta rodada existe, contra a minha própria recomendação

O ledger da rodada 5 recomendou **parar** o ciclo: as perguntas que sobram
seriam todas da sessão no Studio. Testei a recomendação antes de segui-la, que é
a lição da rodada 4 — e ela estava errada por omissão.

**F0-3 é bloqueador da Fase 0 e não depende do Studio.** Ele depende de um
navegador. E eu tenho um.

É também a rodada que quebra o padrão das três anteriores: aqui **eu executo a
verificação**, em vez de construir instrumento para você executar.

## O que torna isto urgente, e não só pendente

O retrofit de i18n da rodada 1 trocou **627 strings em 31 arquivos do painel**,
feito por 31 agentes em paralelo — e **25 dos 31 auditores morreram no limite de
sessão**. O que garantiu o resultado foi análise estática: paridade de chave,
chave órfã, chave morta, string cravada.

Nada disso renderiza. **O painel nunca foi aberto depois do retrofit.** Uma
chave certa com texto que estoura o cartão, um `t()` dentro de um `map` que
quebra a lista, um seletor de idioma que não redesenha — nenhum teste desta
suíte vê isso, e todos apareceriam no primeiro segundo de tela.

## 1. Escopo

Subir ponte e painel juntos, abrir no navegador, e **olhar** — com foco no que
a análise estática não alcança:

- os dois processos se falando de verdade (o contrato que nunca foi exercitado
  fora do `fetch` substituído);
- o painel renderizando depois do retrofit de i18n, nas páginas principais;
- a troca de idioma funcionando na tela, nos três idiomas;
- corrigir o que aparecer.

## 2. Fora de escopo

- **A sessão no Studio.** F0-2, F0-4 e F0-7 continuam esperando você.
- **Iniciar sessão de live real.** Sem TikTok ao vivo, o start conecta num `@`
  que não está transmitindo. O modo de teste com fixture é o caminho.
- **Redesenho.** Se algo estiver feio mas legível, é anotação, não conserto —
  o design system é decisão do dono.
- **Teste de componente renderizado.** Exigiria vitest e testing-library, e
  instalar dependência é decisão de arquitetura não tomada (Bloco 3, em aberto).

## 3. Origem e decisões que este item honra

- **ADR-P03** — o retrofit precisa aparecer certo na tela, não só passar no
  teste.
- **`docs/02_DESIGN_SYSTEM`** — os 6 slots lado a lado sem scroll, e a grade
  fixa em `repeat(6, minmax(0, 1fr))`. Tradução mais longa que o PT é
  exatamente o que pode quebrar isso.
- **`CLAUDE.md`** — nenhuma cor literal, CSS separado do JSX.

## 4. Critérios de aceite

1. Ponte e painel sobem juntos, e a ponte é a **versão de hoje** — a vistoria
   achou uma anterior à rodada 2 rodando nesta máquina.
2. O painel abre no navegador **sem erro no console** que impeça uso.
3. As páginas principais renderizam: Ao vivo, Presentes, Configurar.
4. **Nenhuma chave crua na tela.** Texto como `panel.slotCard.title` aparecendo
   literalmente é chave sem tradução, e é o sintoma que o retrofit poderia ter
   deixado.
5. O seletor de idioma troca a tela para ES e EN, e volta para PT.
6. **Os 6 slots continuam lado a lado, sem scroll**, nos três idiomas.
7. O painel conversa com a ponte de verdade: a lista de presets, o catálogo e o
   estado da sessão chegam da ponte, não de mock.
8. Todo defeito encontrado é corrigido ou registrado com o motivo de não ter
   sido.
9. `npm test` e os gates continuam verdes depois das correções.

## 5. Edge cases conhecidos

- **A ponte antiga ainda no ar:** precisa morrer antes, senão o painel fala com
  a versão errada e o resultado não vale.
- **Sem live real:** o estado "live desligada" é o esperado, não defeito.
- **Sem `GEMINI_API_KEY`:** a geração de mapa fica indisponível, e isso é
  estado legítimo — o mundo montado já existe.
- **Idioma gravado:** trocar o idioma grava em `data/configuracao.json`, que é
  arquivo real do dono. Precisa voltar a `pt` no fim.

## 6. Definição de "aprovado sem ressalvas"

Os 9 critérios em sim, com **evidência de tela** — não com raciocínio sobre o
código. Defeito encontrado é resultado bom: significa que a rodada valeu.
