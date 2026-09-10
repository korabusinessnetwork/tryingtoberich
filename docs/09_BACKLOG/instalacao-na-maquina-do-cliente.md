# Instalar na máquina de outra pessoa

O que uma pessoa que não é o dono precisa fazer para sair do zero e ficar ao
vivo com o jogo reagindo aos presentes. Vale para o **executável portátil**
(ADR-P07) — o instalador do ADR-P04 vem depois e vai automatizar o passo 3.

Tempo: **15 minutos**, quase todo esperando download do Roblox Studio.

> Este documento é a fonte do `LEIA-ME.txt` que acompanha o exe
> (`scripts/modelos/leia-me-do-portatil.txt`). Mudou aqui, muda lá.

---

## O que a pessoa precisa ter

| | Por quê | Quem instala |
|---|---|---|
| Windows 10 ou 11 | o Studio e o exe são de lá | — |
| Conta na TikTok que faz LIVE | é de onde vêm os presentes | — |
| **Roblox Studio** | é onde o jogo roda (ADR-P04) | **ela**, uma vez |
| **Rojo** | monta o jogo dentro do Studio | **ela**, uma vez |
| `KoraStreamGames.exe` | o programa inteiro | copiar o arquivo |

**Node, npm e Git não entram.** Vão dentro do exe.

---

## 1. Roblox Studio

<https://create.roblox.com> → **Start Creating** → entrar com a conta do Roblox.
O instalador do Studio vem junto.

Não precisa criar experiência nenhuma pelo site: o place é montado pelo painel.

## 2. Rojo

No PowerShell:

```powershell
winget install Rojo.Rojo
```

**Feche o terminal e abra um novo depois de instalar** — sem isso o `rojo` não
está no PATH da sessão aberta, e o painel diz que ele não existe.

Sem `winget`: baixar de <https://github.com/rojo-rbx/rojo/releases> e pôr o
`rojo.exe` numa pasta que esteja no PATH.

Confere assim:

```powershell
rojo --version
```

> Por que o exe não instala o Rojo sozinho: portátil que sai instalando programa
> na máquina dos outros deixa de ser portátil. Ver ADR-P07. O instalador do
> ADR-P04 poderá fazer isso, porque aí a pessoa já autorizou uma instalação.

## 3. O Kora Stream Games

Copiar o `KoraStreamGames.exe` para uma pasta própria — ele cria arquivos ao
lado de si — e dar duplo clique.

**Na primeira vez o Windows mostra "O Windows protegeu o computador".** É o
SmartScreen reagindo a um executável sem assinatura digital comprada — não é
detecção de vírus. Caminho: **Mais informações** → **Executar assim mesmo**.
A decisão de não assinar por ora está registrada no ADR-P07, com o custo.

O que acontece no primeiro uso:

- nasce o `.env`, com um `BRIDGE_TOKEN` sorteado só para aquela máquina;
- nascem o `data/` e o `game/` ao lado do exe;
- a ponte sobe em `127.0.0.1:8787` (jogo) e `127.0.0.1:8788` (painel);
- a janela do programa abre.

Não há janela preta de console. Fechar a janela desliga o jogo — e encerra a
sessão de verdade, que é o que descarta o dado de espectador. O que aconteceu
na última abertura fica em `kora.log`, na mesma pasta.

A primeira abertura demora alguns segundos a mais: o portátil se descompacta
antes de rodar. As seguintes reaproveitam.

## 4. A conta da live

Na aba **Configurar**, informar o `@` da conta da TikTok. Fica gravado em
`data/configuracao.json` e vale entre sessões — não precisa editar arquivo
nenhum.

## 5. O jogo no Studio

Aba **Jogo** → **Abrir o jogo no Studio**. O botão monta o place com o token e
o endereço já preenchidos e abre o Studio nele. Sobra dar **Play**.

Se faltar o Rojo, é este botão que avisa, repetindo o comando do passo 2.

## 6. Ao vivo

Aba **Ao vivo** → **Iniciar live**. A ponte conecta na live e cada presente vira
animação. Antes de abrir a live de verdade, o **modo de teste** dispara presente
de mentira e prova que o caminho inteiro está de pé.

---

## Manutenção

**Backup** — copiar a pasta `data/`. É tudo que é do streamer.

**Atualizar** — substituir o `KoraStreamGames.exe` pelo novo, na mesma pasta. O
`data/` e o `.env` ficam onde estão. O `game/` e os schemas são atualizados
sozinhos na abertura seguinte, porque são programa e precisam casar com a versão
instalada (ADR-P07).

**Desinstalar** — apagar a pasta. Nada foi escrito no registro nem fora dela.

**Mover para outra máquina** — copiar a pasta inteira MENOS o `.env`. O token é
daquela instalação; deixar o exe criar um novo.

---

## Quando dá errado

| Sintoma | O que é | O que fazer |
|---|---|---|
| Uma caixa de erro ao abrir | o programa não conseguiu subir | ler a caixa; o detalhe completo está em `kora.log`, na mesma pasta |
| "Já existe um Kora Stream Games rodando" | sobrou uma cópia anterior | encerrar pelo Gerenciador de Tarefas |
| A tela travou | o painel, não a ponte | **F5** recarrega |
| "O Rojo não está instalado" | o PATH não foi recarregado | fechar o terminal, abrir outro, e clicar de novo |
| Presente chega e o boneco não reage | o Studio não está em Play, ou perdeu a ponte | dar Play; conferir "Jogo online" na tela |
| Todos os presentes do preset aparecem em vermelho | o catálogo ainda não foi coletado da live | conectar na live uma vez; o catálogo real chega e substitui a semente |
