/**
 * A atualização automática, e ela é covarde de propósito.
 *
 * O ADR-P04 pede "mantido por atualizador automático", e o motivo é concreto: o
 * dia em que o TikTok mudar o protocolo, a correção só chega a quem atualizou.
 * Mas o cliente é streamer, e o programa está aberto exatamente quando ele está
 * ao vivo. **Uma atualização que trava o programa no dia da live é pior que não
 * ter atualização nenhuma.** Daí as quatro regras abaixo, nesta ordem de força:
 *
 *   1. Nunca no arranque. A checagem só começa um tempo DEPOIS de a janela
 *      abrir, e num timer solto: se ela demorar, ninguém espera por ela.
 *   2. Nunca uma caixa de diálogo. Todo erro, seja sem rede, sem servidor,
 *      release sem `latest.yml` ou DNS caído, vira uma linha em `kora.log`.
 *   3. Nunca reiniciar sozinho. O download é em segundo plano e a instalação
 *      acontece no `quit`, quando o streamer JÁ fechou o programa. A versão
 *      nova aparece na próxima abertura, nunca no meio da live.
 *   4. Nunca no portátil. Um `.exe` avulso que se substitui sozinho enquanto
 *      roda não existe no Windows; lá a atualização é "troque o arquivo", e é
 *      isso que o LEIA-ME manda fazer.
 *
 * ONDE ELE PROCURA: no GitHub Releases do repositório da Kora, configurado em
 * `scripts/empacotar.mjs` (`publish`), que é o que faz o `electron-builder`
 * gravar o `app-update.yml` dentro do pacote. Escolhido porque custa US$ 0 e o
 * repositório já está lá (CLAUDE.md, Custo). Enquanto não houver release
 * publicado, este módulo inteiro não faz nada visível, que é o comportamento
 * desejado e não um bug.
 *
 * POR QUE O `require` MORA DENTRO DA FUNÇÃO E DENTRO DE UM `try`: o
 * `electron-updater` é fundido no pacote pelo `rolldown`, junto com a ponte. Se
 * um dia ele não estiver instalado na máquina de build, o `require` falha, o
 * `catch` engole, e o programa abre igual, sem atualização, mas abre. Um
 * `require` no topo transformaria isso em tela de erro na máquina do cliente.
 */

const { app } = require("electron");

/**
 * Quanto tempo depois da janela a checagem começa.
 *
 * Não é medo de banda: é o disco e a CPU. O primeiro meio minuto do programa é
 * onde a semente é escrita, o painel é servido e a live conecta. Baixar 96 MB
 * junto disso é a diferença entre "abriu" e "abriu travando".
 */
const ESPERA_MS = 45_000;

/** Só a versão INSTALADA se atualiza sozinha. Ver a regra 4 lá em cima. */
function podeSeAtualizar() {
  return app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;
}

/**
 * Liga a atualização automática. Devolve o timer, ou `null` quando não há nada
 * a fazer, e quem chama não precisa saber a diferença.
 */
function ligarAtualizacao() {
  if (!podeSeAtualizar()) return null;

  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (erro) {
    console.warn(`Atualização automática indisponível neste build: ${erro?.message ?? erro}`);
    return null;
  }

  try {
    // O logger do electron-updater é o nosso `console`, que o `principal.cjs`
    // já desviou para o `kora.log`. É lá que se descobre, depois, por que a
    // máquina do cliente continuava na versão velha.
    autoUpdater.logger = console;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on("error", (erro) => console.warn(`Atualização: ${erro?.message ?? erro}`));
    autoUpdater.on("update-not-available", () => console.log("Atualização: já está na versão mais nova."));
    autoUpdater.on("update-available", (info) => console.log(`Atualização ${info?.version} disponível, baixando em segundo plano.`));
    autoUpdater.on("update-downloaded", (info) =>
      console.log(`Atualização ${info?.version} baixada. Ela é instalada quando você fechar o programa.`),
    );

    const relogio = setTimeout(() => {
      // `checkForUpdates` rejeita quando não há servidor, quando o release não
      // tem `latest.yml` e quando a máquina está sem rede. Nenhum dos três é
      // problema do streamer, e nenhum dos três pode virar tela.
      autoUpdater.checkForUpdates().catch((erro) => console.warn(`Atualização: ${erro?.message ?? erro}`));
    }, ESPERA_MS);

    // Sem isto, o timer segura o processo vivo depois de a janela fechar.
    relogio.unref?.();
    return relogio;
  } catch (erro) {
    console.warn(`Atualização: não consegui ligar. ${erro?.message ?? erro}`);
    return null;
  }
}

module.exports = { ESPERA_MS, ligarAtualizacao, podeSeAtualizar };
