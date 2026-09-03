import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "./lib/api.js";
import { idDePreset, SLOTS } from "./lib/regras.js";
import { useFluxo } from "./lib/useFluxo.js";
import { AvisoDeVitoria } from "./components/AvisoDeVitoria.jsx";
import { BarraDeSessao } from "./components/BarraDeSessao.jsx";
import { BotaoAbrirJogo } from "./components/BotaoAbrirJogo.jsx";
import { ContaDaLive } from "./components/ContaDaLive.jsx";
import { ControleDaPartida } from "./components/ControleDaPartida.jsx";
import { EditorDePlacar } from "./components/EditorDePlacar.jsx";
import { EditorDePreset } from "./components/EditorDePreset.jsx";
import { GaleriaDeSkins } from "./components/GaleriaDeSkins.jsx";
import { SeletorDeMundo } from "./components/SeletorDeMundo.jsx";
import { GerenciadorDePresets } from "./components/GerenciadorDePresets.jsx";
import { HistoricoDeSessoes } from "./components/HistoricoDeSessoes.jsx";
import { MonitorAoVivo } from "./components/MonitorAoVivo.jsx";
import { NavegacaoDePaginas } from "./components/NavegacaoDePaginas.jsx";
import { PainelDeOverlay } from "./components/PainelDeOverlay.jsx";
import { PainelDeAcervo } from "./components/PainelDeAcervo.jsx";
import { PainelDeLogs } from "./components/PainelDeLogs.jsx";
import { ResumoDaLive } from "./components/ResumoDaLive.jsx";
import { PreviaDeMapa } from "./components/PreviaDeMapa.jsx";
import { SeletorDeAnimacao } from "./components/SeletorDeAnimacao.jsx";
import { SeletorDeLook } from "./components/SeletorDeLook.jsx";
import { SeletorDePresente } from "./components/SeletorDePresente.jsx";
import { SeletorModalidade } from "./components/SeletorModalidade.jsx";
import { TestadorDeAnimacao } from "./components/TestadorDeAnimacao.jsx";
import { TestadorDePresente } from "./components/TestadorDePresente.jsx";
import "./App.css";

/**
 * O painel, em três páginas.
 *
 * O 02_DESIGN_SYSTEM exige densidade e leitura de canto de olho: o streamer
 * olha por 2 segundos por vez. Isso não proíbe navegação — proíbe ESCONDER o
 * que ele olha durante a live. Por isso "Ao vivo" é a página de abertura e
 * carrega os 6 slots, o monitor e o testador; e "Configurar" leva o que o
 * próprio layout já tratava como pré-live e travava com a sessão rodando
 * (modalidade, look e mapa). Assim os slots ganham a largura inteira, que é o
 * que o design system pede: os 6 lado a lado, sem scroll.
 *
 * Este arquivo carrega dado, guarda estado e distribui. Ele é o único que
 * chama `api`, porque componente não toca a rede (CLAUDE.md) — um teste em
 * `panel/test/componentesSemRede.test.mjs` faz essa regra valer.
 *
 * Regra de negócio mora em `lib/regras.js`, rede em `lib/api.js`, e desenho
 * nos componentes. Aqui só sobra fiação.
 */
export function App() {
  const [dados, definirDados] = useState(null);
  const [erroDeCarga, definirErroDeCarga] = useState(null);

  const [preset, definirPreset] = useState(null);
  const [salvando, definirSalvando] = useState(false);
  const [iniciando, definirIniciando] = useState(false);
  const [erroDeMapa, definirErroDeMapa] = useState(null);
  const [prontidao, definirProntidao] = useState(null);
  const [disparando, definirDisparando] = useState(false);
  const [disparandoAnimacao, definirDisparandoAnimacao] = useState(false);
  const [ultimaAnimacao, definirUltimaAnimacao] = useState(null);
  const [salvandoConta, definirSalvandoConta] = useState(false);
  const [atualizandoCatalogo, definirAtualizandoCatalogo] = useState(false);
  const [trocandoPreset, definirTrocandoPreset] = useState(false);
  const [reiniciando, definirReiniciando] = useState(false);
  // O resumo do F5, guardado do retorno do Stop. Some quando o streamer fecha
  // ou quando a próxima sessão começa — ele é sobre a live que acabou.
  const [resumoDaLive, definirResumoDaLive] = useState(null);
  const [sessoes, definirSessoes] = useState(null);
  const [carregandoSessoes, definirCarregandoSessoes] = useState(false);
  const [sessaoEscolhida, definirSessaoEscolhida] = useState(null);
  const [acervo, definirAcervo] = useState(null);
  const [salvandoAcervo, definirSalvandoAcervo] = useState(false);
  const [erroDeAcervo, definirErroDeAcervo] = useState(null);
  const [montandoMundo, definirMontandoMundo] = useState(false);
  const [recadoDoMundo, definirRecadoDoMundo] = useState(null);
  const [publicandoAcervo, definirPublicandoAcervo] = useState(false);
  const [relatorioDoAcervo, definirRelatorioDoAcervo] = useState(null);
  const [skinEspiada, definirSkinEspiada] = useState(null);
  const [espiandoSkin, definirEspiandoSkin] = useState(false);
  const [salvandoGaleria, definirSalvandoGaleria] = useState(false);
  const [comandandoPartida, definirComandandoPartida] = useState(false);
  const [recadoDaPartida, definirRecadoDaPartida] = useState(null);
  const [abrindoJogo, definirAbrindoJogo] = useState(false);
  const [studio, definirStudio] = useState(null);
  const [erroDoStudio, definirErroDoStudio] = useState(null);
  const [aviso, definirAviso] = useState(null);
  const [pagina, definirPagina] = useState("aovivo");
  // Quantos problemas já estavam no log da última vez que a página foi aberta.
  // Sem isso o contador nunca zera e vira enfeite permanente.
  const [problemasVistos, definirProblemasVistos] = useState(0);

  // Qual slot está com um modal aberto, e qual modal. Um de cada vez: dois
  // modais empilhados num painel de segunda tela é jeito de perder o clique.
  const [editando, definirEditando] = useState(null);

  const fluxo = useFluxo();

  const carregar = useCallback(async () => {
    try {
      const [modalidades, presets, animacoes, catalogo, looks, mapas, sessao, cenarios, configuracao] = await Promise.all([
        api.modalidades(), api.listarPresets(), api.animacoes(), api.catalogo(),
        api.looks(), api.mapas(), api.sessao(), api.cenarios(), api.configuracao(),
      ]);
      definirDados({ modalidades, presets, animacoes, catalogo, looks, mapas, sessao, cenarios, configuracao });
      // O que a ponte registrou ANTES do painel abrir. O que vem depois chega
      // pelo SSE, e o hook junta os dois.
      api.logs()
        .then((linhas) => fluxo.juntarLogs(linhas.map((l) => ({ ...l, origem: "ponte" }))))
        .catch(() => {});
      definirPreset((atual) => atual ?? presets[0] ?? null);
      definirErroDeCarga(null);
    } catch (falha) {
      definirErroDeCarga(falha);
    }
    // Depende da FUNÇÃO, não do objeto `fluxo`. useFluxo devolve um objeto novo
    // a cada render; usar ele aqui recriava `carregar`, o efeito abaixo disparava
    // de novo, o setState re-renderizava, e o ciclo se repetia sem parar — nove
    // requisições por volta, até o navegador ficar sem socket
    // (ERR_INSUFFICIENT_RESOURCES). `juntarLogs` é useCallback([]), estável.
  }, [fluxo.juntarLogs]);

  useEffect(() => { carregar(); }, [carregar]);

  /** Toda ação que fala com a ponte passa por aqui, e toda falha vira aviso na tela. */
  const executar = useCallback(async (acao, { aoFalhar } = {}) => {
    try {
      return await acao();
    } catch (falha) {
      const texto = falha?.message ?? "Algo falhou.";
      // O aviso some da tela; a linha de log fica. Quando o streamer perceber
      // que algo parou, é no log que ele vai olhar.
      fluxo.registrarLocal("erro", falha?.codigo ?? "acao_falhou", { mensagem: texto });
      if (aoFalhar) aoFalhar(falha);
      else definirAviso(texto);
      return null;
    }
  }, [fluxo.registrarLocal]);  // a função, não o objeto: ver `carregar` acima

  const mudarSlot = useCallback((posicao, campos) => {
    definirPreset((atual) => {
      if (!atual) return atual;
      const outros = (atual.slots ?? []).filter((s) => s.posicao !== posicao);
      const anterior = (atual.slots ?? []).find((s) => s.posicao === posicao) ?? { posicao };
      const novo = { ...anterior, ...campos, posicao };
      return { ...atual, slots: [...outros, novo].sort((a, b) => a.posicao - b.posicao) };
    });
  }, []);

  //[[ Os presentes de placar vivem numa lista propria, fora dos 6 slots.
  //
  // Tres funcoes e nao uma: acrescentar, trocar o efeito e remover sao acoes
  // diferentes na tela, e juntar as tres num "mudar" generico obrigaria o
  // componente a saber quando passar null — que e regra de dominio vazando
  // para o desenho. ]]
  const adicionarAoPlacar = useCallback((presenteId) => {
    definirPreset((atual) => {
      if (!atual) return atual;
      const placar = atual.placar ?? [];
      if (placar.some((v) => v.presenteId === presenteId)) return atual;
      return { ...atual, placar: [...placar, { presenteId, efeito: "vitoria" }] };
    });
  }, []);

  const mudarEfeitoDoPlacar = useCallback((presenteId, efeito) => {
    definirPreset((atual) => {
      if (!atual) return atual;
      return {
        ...atual,
        placar: (atual.placar ?? []).map((v) => (v.presenteId === presenteId ? { ...v, efeito } : v)),
      };
    });
  }, []);

  const removerDoPlacar = useCallback((presenteId) => {
    definirPreset((atual) => {
      if (!atual) return atual;
      return { ...atual, placar: (atual.placar ?? []).filter((v) => v.presenteId !== presenteId) };
    });
  }, []);

  const limparSlot = useCallback((posicao) => {
    definirPreset((atual) =>
      atual ? { ...atual, slots: (atual.slots ?? []).filter((s) => s.posicao !== posicao) } : atual,
    );
  }, []);

  const salvarPreset = useCallback(async () => {
    if (!preset) return;
    definirSalvando(true);
    const salvo = await executar(() => api.salvarPreset(preset));
    if (salvo) {
      definirPreset(salvo);
      definirAviso(null);
    }
    definirSalvando(false);
  }, [preset, executar]);

  //[[ Escolher o mapa SALVA na hora. Não é rascunho.
  //
  // O resto do editor é rascunho de verdade: mexer num slot e desistir é
  // normal, e por isso existe o botão Salvar. Mapa não — escolher um mapa é uma
  // ordem com efeito imediato, e a ponte responde a ela mandando o jogo reerguer
  // a torre.
  //
  // Enquanto isto exigia um segundo clique, "botei pra usar" não botava nada: o
  // preset em disco continuava no mapa antigo, o jogo continuava certo em servir
  // o mapa antigo, e a tela ficava mostrando o mapa novo escolhido. Tudo
  // coerente, e o mundo sem mudar.
  //
  // Recebe o id em vez de ler o estado: `preset` aqui seria o de antes da
  // troca, e salvaria o mapa velho por cima do novo. ]]
  //[[ Montar o mundo com as peças escolhidas na galeria.
  //
  // Entra no ar na hora: montar e não usar não é um gesto que exista. A ponte
  // grava sempre no MESMO arquivo — cada clique criando um mapa novo encheria a
  // lista de descartes em minutos, que foi o que aconteceu com o gerador por
  // texto. ]]
  const montarMundo = useCallback(async (escolhas) => {
    definirMontandoMundo(true);
    definirErroDeMapa(null);
    const resultado = await executar(() => api.montarMundo(escolhas), {
      aoFalhar: (falha) => definirErroDeMapa(falha?.message ?? "Não consegui montar o mundo."),
    });
    if (resultado) {
      definirDados((d) => ({
        ...d,
        mapas: [...d.mapas.filter((m) => m.mapaId !== resultado.mapa.mapaId), resultado.mapa],
      }));
      definirPreset((atual) => (atual ? { ...atual, mapaId: resultado.mapa.mapaId } : atual));
      definirProntidao(resultado.prontidao);
      // A HORA é o que faz montar duas vezes o mesmo mundo ainda dar sinal: o
      // nome e as peças seriam idênticos, e a tela pareceria não ter reagido.
      definirRecadoDoMundo(
        `Mundo montado às ${new Date().toLocaleTimeString("pt-BR")}. A torre está sendo reerguida.`,
      );
    }
    definirMontandoMundo(false);
  }, [executar]);

  /**
   * Cria um preset vazio. É o mesmo PUT do salvar: o repositório grava o
   * arquivo que ainda não existe, e `streamerId` quem preenche é a ponte —
   * o painel não conhece o tenant (ADR-003).
   */
  const criarPreset = useCallback(async (nome, presetId) => {
    definirSalvando(true);
    const novo = await executar(() => api.salvarPreset({
      presetId,
      nome,
      modalidade: preset?.modalidade ?? "escalada",
      slots: [],
    }));
    if (novo) {
      definirDados((d) => ({ ...d, presets: [...d.presets.filter((p) => p.presetId !== novo.presetId), novo] }));
      definirPreset(novo);
      definirAviso(null);
    }
    definirSalvando(false);
  }, [executar, preset]);

  /**
   * Duplica o preset atual. Montar os 6 slots dá trabalho, e a live de sexta é
   * a de quinta com dois presentes trocados.
   */
  const duplicarPreset = useCallback(async (base) => {
    if (!base) return;
    const existentes = new Set((dados?.presets ?? []).map((p) => p.presetId));
    // "-copia", "-copia-2", "-copia-3"… duplicar duas vezes seguidas não pode
    // sobrescrever a primeira cópia em silêncio.
    let sufixo = 1;
    let id = idDePreset(`${base.presetId}-copia`);
    while (existentes.has(id)) {
      sufixo += 1;
      id = idDePreset(`${base.presetId}-copia-${sufixo}`);
    }

    definirSalvando(true);
    const copia = await executar(() => api.salvarPreset({
      ...base,
      presetId: id,
      nome: sufixo === 1 ? `${base.nome} (cópia)` : `${base.nome} (cópia ${sufixo})`,
    }));
    if (copia) {
      definirDados((d) => ({ ...d, presets: [...d.presets, copia] }));
      definirPreset(copia);
    }
    definirSalvando(false);
  }, [executar, dados]);

  const apagarPreset = useCallback(async (presetId) => {
    definirSalvando(true);
    const apagado = await executar(() => api.apagarPreset(presetId));
    if (apagado) {
      definirDados((d) => {
        const restantes = d.presets.filter((p) => p.presetId !== presetId);
        // O preset apagado era o que estava na tela: cai para o primeiro que
        // sobrou, senão o editor fica montado em cima de um arquivo que já não
        // existe e o Salvar o ressuscitaria.
        definirPreset((atual) => (atual?.presetId === presetId ? restantes[0] ?? null : atual));
        return { ...d, presets: restantes };
      });
    }
    definirSalvando(false);
  }, [executar]);

  /**
   * Troca o preset da tela — e, com a sessão rodando, o preset ATIVO na ponte.
   *
   * R7: trocar no meio da sessão é permitido e vale a partir do próximo
   * evento. Fora da sessão isso é só escolher o que editar, e não precisa
   * falar com a ponte.
   */
  const escolherPreset = useCallback(async (presetId) => {
    const escolhido = (dados?.presets ?? []).find((p) => p.presetId === presetId) ?? null;
    if (!escolhido) return;

    const rodando = fluxo.estado?.sessao === "rodando" || dados?.sessao?.estado?.sessao === "rodando";
    if (!rodando) {
      definirPreset(escolhido);
      return;
    }

    definirTrocandoPreset(true);
    // Só troca na tela depois que a ponte confirmou: mostrar o preset novo com
    // a ponte ainda casando presente pelo antigo seria mentir na única tela que
    // o streamer olha durante a live.
    const ativo = await executar(() => api.trocarPresetAtivo(presetId));
    if (ativo) definirPreset(ativo);
    definirTrocandoPreset(false);
  }, [executar, dados, fluxo.estado]);

  const iniciarSessao = useCallback(async (presetId, cenario) => {
    definirIniciando(true);
    // O resumo é da live anterior. Começar outra com ele na tela confundiria
    // dois números que não têm nada a ver um com o outro.
    definirResumoDaLive(null);
    await executar(() => api.iniciarSessao(presetId, cenario));
    await executar(() => api.sessao().then((sessao) => definirDados((d) => ({ ...d, sessao }))));
    definirIniciando(false);
  }, [executar]);

  const carregarSessoes = useCallback(async () => {
    definirCarregandoSessoes(true);
    const lista = await executar(() => api.sessoes());
    if (lista) definirSessoes(lista);
    definirCarregandoSessoes(false);
  }, [executar]);

  const pararSessao = useCallback(async () => {
    // F5.5 — "Painel mostra o resumo da live". A ponte reduz a sessão ao
    // agregado, grava e DEVOLVE; até aqui o painel jogava essa resposta fora.
    const resumo = await executar(() => api.encerrarSessao());
    if (resumo) definirResumoDaLive(resumo);
    await executar(() => api.sessao().then((sessao) => definirDados((d) => ({ ...d, sessao }))));
    // A live que acabou é uma linha nova no histórico. Recarrega só se a
    // página já foi aberta alguma vez — senão é requisição para ninguém.
    if (sessoes) carregarSessoes();
  }, [executar, sessoes, carregarSessoes]);

  /** R6 — o topo não reinicia sozinho. Este é o botão que o streamer decide apertar. */
  const reiniciarCorrida = useCallback(async () => {
    definirReiniciando(true);
    const resultado = await executar(() => api.reiniciarCorrida());
    if (resultado && !resultado.jogoOnline) {
      definirAviso("O comando de reinício saiu, mas o Roblox não está conectado — ele foi descartado.");
    }
    definirReiniciando(false);
  }, [executar]);

  /** F2.4 — os presentes de verdade da TikTok: da sala se houver live, do painel público se não. */
  const atualizarCatalogo = useCallback(async () => {
    definirAtualizandoCatalogo(true);
    const catalogo = await executar(() => api.atualizarCatalogo());
    if (catalogo) definirDados((d) => ({ ...d, catalogo }));
    definirAtualizandoCatalogo(false);
  }, [executar]);

  const carregarAcervo = useCallback(async () => {
    const carregado = await executar(() => api.acervo(), {
      aoFalhar: (falha) => definirErroDeAcervo(falha?.message ?? "Não consegui ler o acervo."),
    });
    if (carregado) {
      definirAcervo(carregado);
      definirErroDeAcervo(null);
    }
  }, [executar]);

  /**
   * Anota o resultado da moderação num item do acervo (ADR-004).
   *
   * Depois de gravar, a prontidão do mapa escolhido é relida: aprovar o skybox
   * é exatamente o que faz um mapa que não podia ir ao ar passar a poder, sem
   * ninguém ter tocado no mapa.
   */
  const anotarAcervo = useCallback(async (colecao, id, campos) => {
    definirSalvandoAcervo(true);
    const resultado = await executar(() => api.anotarAcervo(colecao, id, campos), {
      aoFalhar: (falha) => definirErroDeAcervo(falha?.message ?? "Não consegui gravar."),
    });
    if (resultado) {
      definirAcervo(resultado.acervo);
      definirErroDeAcervo(null);
      const mapaId = preset?.mapaId;
      if (mapaId) {
        const prontidaoNova = await executar(() => api.prontidaoDoMapa(mapaId), { aoFalhar: () => {} });
        if (prontidaoNova) definirProntidao(prontidaoNova);
      }
    }
    definirSalvandoAcervo(false);
  }, [executar, preset]);

  const testarPresentes = useCallback(async (presentes) => {
    definirDisparando(true);
    await executar(() => api.testarPresentes(presentes));
    definirDisparando(false);
  }, [executar]);

  const testarAnimacao = useCallback(async (animacaoId, intensidade) => {
    definirDisparandoAnimacao(true);
    const resultado = await executar(() => api.testarAnimacao(animacaoId, intensidade));
    // Marca o botão só se o disparo saiu. Marcar antes da resposta faria o
    // painel dizer que tocou quando a ponte recusou.
    if (resultado) {
      definirUltimaAnimacao(resultado.animacaoId);
      // A ponte aceitou, mas o long-poll descartou: sem isto o clique some sem
      // explicação e o streamer culpa a animação.
      if (!resultado.jogoOnline) definirAviso("A animação saiu, mas o Roblox não está conectado — nada vai aparecer na tela.");
    }
    definirDisparandoAnimacao(false);
  }, [executar]);

  const salvarConta = useCallback(async (usuarioTiktok) => {
    definirSalvandoConta(true);
    const salva = await executar(() => api.salvarConfiguracao(usuarioTiktok));
    // Guarda o que a PONTE devolveu, não o que foi digitado: ela normaliza
    // (tira arroba, aceita URL colada), e a tela tem que mostrar o que valeu.
    if (salva) definirDados((d) => ({ ...d, configuracao: salva }));
    definirSalvandoConta(false);
  }, [executar]);

  //[[ As tres ordens da partida.
  //
  // Uma funcao so, parametrizada: elas diferem apenas na chamada e no texto, e
  // tres blocos iguais divergiriam na primeira mudanca. O `jogoOnline` da
  // resposta e o que impede o botao de parecer que funcionou quando o comando
  // foi descartado pelo long-poll. ]]
  const comandarPartida = useCallback(async (acao, rotulo) => {
    definirComandandoPartida(true);
    definirRecadoDaPartida(null);

    const resultado = await executar(acao);
    if (resultado) {
      definirRecadoDaPartida(
        resultado.jogoOnline
          ? `${rotulo}: ordem enviada ao jogo.`
          : `${rotulo}: o Roblox está fora, a ordem foi descartada.`,
      );
    }
    definirComandandoPartida(false);
  }, [executar]);

  //[[ Encher o acervo é o que destrava a variedade dos mapas.
  //
  // Com um céu e uma textura aprovados, todo mapa gerado sai igual — e lê como
  // defeito do gerador. A ponte desenha o que falta, sobe e anota o assetId; a
  // moderação continua sendo do Roblox, então o item entra em `em-moderacao` e
  // só depois vira aprovado. Recarrega o acervo no fim para a lista da tela
  // mostrar o número novo. ]]
  const publicarAcervo = useCallback(async () => {
    definirPublicandoAcervo(true);
    definirErroDeAcervo(null);
    const resultado = await executar(() => api.publicarAcervo(), {
      aoFalhar: (falha) => definirErroDeAcervo(falha?.message ?? "Não consegui publicar o acervo."),
    });
    if (resultado) {
      definirRelatorioDoAcervo(resultado.relatorio);
      // Relê pelo mesmo caminho de sempre: a lista da tela precisa mostrar o
      // número novo, e duas formas de carregar o acervo divergiriam.
      await carregarAcervo();
    }
    definirPublicandoAcervo(false);
  }, [executar, carregarAcervo]);

  const espiarSkin = useCallback(async (nick) => {
    definirEspiandoSkin(true);
    definirSkinEspiada(null);
    const skin = await executar(() => api.espiarSkin(nick));
    if (skin) definirSkinEspiada(skin);
    definirEspiandoSkin(false);
  }, [executar]);

  //[[ A galeria vai INTEIRA para a ponte, não em diff.
  //
  // Ela é um conjunto pequeno e a ponte já normaliza (tira arroba, remove
  // duplicata). Mandar a lista toda deixa a ponte ser dona da normalização, em
  // vez de a tela ter que adivinhar como ficou. ]]
  const salvarGaleria = useCallback(async (nicks) => {
    definirSalvandoGaleria(true);
    const salva = await executar(() => api.salvarGaleria(nicks));
    if (salva) definirDados((d) => ({ ...d, configuracao: salva }));
    definirSalvandoGaleria(false);
  }, [executar]);

  const abrirNoStudio = useCallback(async () => {
    definirAbrindoJogo(true);
    definirErroDoStudio(null);
    const resultado = await executar(() => api.abrirNoStudio(), {
      // Erro aqui é do lado da máquina (Studio ausente, plataforma errada) e
      // pertence ao bloco do botão, não ao aviso solto no topo da tela.
      aoFalhar: (falha) => definirErroDoStudio(falha?.message ?? "Não consegui abrir o Studio."),
    });
    if (resultado) definirStudio(resultado);
    definirAbrindoJogo(false);
  }, [executar]);

  /**
   * ADR-004 — a prontidão do mapa escolhido, sempre que ele muda.
   *
   * Antes disto só a geração respondia essa pergunta, e só para o mapa
   * recém-nascido: escolher um mapa salvo deixava a prévia dizendo "prontidão
   * ainda não avaliada", que desenha igual a "pode ir ao ar" para quem olha com
   * pressa. E a resposta muda sem o mapa mudar — ela depende do acervo.
   */
  useEffect(() => {
    const mapaId = preset?.mapaId;
    if (!mapaId) {
      definirProntidao(null);
      return undefined;
    }

    // O painel pode desmontar ou o streamer trocar de mapa antes da resposta
    // chegar. Sem esta trava, a prontidão do mapa antigo pintaria a prévia do
    // novo — e nesta tela isso é dizer que um mapa pode ir ao ar quando não pode.
    let valeAinda = true;
    api.prontidaoDoMapa(mapaId)
      .then((resultado) => { if (valeAinda) definirProntidao(resultado); })
      .catch(() => { if (valeAinda) definirProntidao(null); });
    return () => { valeAinda = false; };
  }, [preset?.mapaId]);

  /** O acervo e o histórico só carregam quando a página que os usa abre. */
  useEffect(() => {
    if (pagina === "configurar" && !acervo) carregarAcervo();
    if (pagina === "historico" && !sessoes) carregarSessoes();
  }, [pagina, acervo, sessoes, carregarAcervo, carregarSessoes]);

  /**
   * F2.4 — põe um presente não mapeado no primeiro slot livre.
   *
   * O monitor contava o que estava sendo deixado na mesa e não deixava agir:
   * era anotar o nome, abrir o editor e procurar o presente no catálogo, no
   * meio da live. Aqui o slot já sai preenchido e válido — com delta e
   * animação padrão, que o modal aberto em seguida deixa ajustar — porque
   * slot pela metade seria recusado pelo schema no Salvar.
   */
  const vincularNaoMapeado = useCallback((item) => {
    if (!preset) return;
    if (!item?.presenteId) return;

    const ocupadas = new Set((preset.slots ?? []).map((slot) => slot.posicao));
    const livre = Array.from({ length: SLOTS }, (_, i) => i + 1).find((posicao) => !ocupadas.has(posicao));
    if (!livre) {
      definirAviso("Os 6 slots estão ocupados. Limpe um antes de vincular outro presente.");
      return;
    }

    const padrao = (dados?.animacoes ?? []).find((a) => a.direcao === "subida") ?? (dados?.animacoes ?? [])[0];
    mudarSlot(livre, {
      presenteId: item.presenteId,
      animacaoId: padrao?.id,
      delta: 1,
      intensidade: 1,
    });
    // Abre a escolha de animação na sequência: o padrão existe para o slot
    // nascer válido, não para ser a escolha final.
    definirEditando({ posicao: livre, tipo: "animacao" });
    definirAviso(null);
  }, [preset, dados, mudarSlot]);

  const slotEditado = useMemo(
    () => (editando ? (preset?.slots ?? []).find((s) => s.posicao === editando.posicao) ?? null : null),
    [editando, preset],
  );

  const mapaEscolhido = useMemo(
    () => dados?.mapas?.find((m) => m.mapaId === preset?.mapaId) ?? null,
    [dados, preset],
  );

  const problemas = useMemo(
    () => fluxo.logs.filter((l) => l.nivel === "erro" || l.nivel === "aviso").length,
    [fluxo.logs],
  );
  const naoVistos = Math.max(0, problemas - problemasVistos);

  // A sessão rodando trava o que não pode mudar no meio da partida: modalidade,
  // look (ADR-011) e troca de mapa (F4).
  const aoVivo = fluxo.estado?.sessao === "rodando" || dados?.sessao?.estado?.sessao === "rodando";
  // O SSE na frente, a carga inicial atrás: antes do primeiro evento do fluxo
  // o painel ainda precisa saber se o Roblox está de pé.
  const jogoOnline = (fluxo.estado ?? dados?.sessao?.estado)?.jogo === "online";

  if (erroDeCarga) {
    return (
      <main className="app app-vazio">
        <h1 className="app-titulo">Kora Stream Games</h1>
        <p className="pastilha pastilha-erro">{erroDeCarga.message}</p>
        <button onClick={carregar}>Tentar de novo</button>
      </main>
    );
  }

  if (!dados) {
    return (
      <main className="app app-vazio">
        <h1 className="app-titulo">Kora Stream Games</h1>
        <p className="secundario">Carregando…</p>
      </main>
    );
  }

  return (
    <main className="app">
      <BarraDeSessao
        estado={fluxo.estado ?? dados.sessao?.estado ?? null}
        sessao={dados.sessao?.sessao ?? null}
        presets={dados.presets}
        presetId={preset?.presetId ?? null}
        cenarios={dados.cenarios}
        iniciando={iniciando}
        trocandoPreset={trocandoPreset}
        aoIniciar={iniciarSessao}
        aoParar={pararSessao}
        aoTrocarPreset={escolherPreset}
      />

      {aviso ? <p className="pastilha pastilha-erro app-aviso">{aviso}</p> : null}

      <NavegacaoDePaginas
        paginas={[
          { id: "aovivo", rotulo: "Ao vivo" },
          { id: "configurar", rotulo: "Configurar" },
          { id: "jogo", rotulo: "Jogo" },
          { id: "overlay", rotulo: "Overlay" },
          { id: "historico", rotulo: "Histórico" },
          { id: "log", rotulo: "Log", contador: naoVistos },
        ]}
        atual={pagina}
        aoTrocar={(destino) => {
          definirPagina(destino);
          // Abrir o log zera o contador: o que ele marca é problema NÃO VISTO.
          if (destino === "log") definirProblemasVistos(problemas);
        }}
      />

      {pagina === "aovivo" ? (
        <div className="app-pagina">
          {/* R6 — o único bloco que pode empurrar os 6 slots para baixo, e só
              enquanto durar a decisão que o jogo está esperando. */}
          <AvisoDeVitoria
            estado={fluxo.estado ?? dados.sessao?.estado ?? null}
            reiniciando={reiniciando}
            aoReiniciar={reiniciarCorrida}
          />

          {/* F5.5 — aparece no Stop e fica até o streamer fechar. Não some
              sozinho: é a única leitura da live que acabou. */}
          {resumoDaLive && (
            <ResumoDaLive
              sessao={resumoDaLive}
              titulo="A live que acabou"
              aoFechar={() => definirResumoDaLive(null)}
            />
          )}

          <EditorDePreset
            preset={preset}
            catalogo={dados.catalogo}
            animacoes={dados.animacoes}
            salvando={salvando}
            aoMudarSlot={mudarSlot}
            aoLimparSlot={limparSlot}
            aoSalvar={salvarPreset}
            aoEditarPresente={(posicao) => definirEditando({ posicao, tipo: "presente" })}
            aoEditarAnimacao={(posicao) => definirEditando({ posicao, tipo: "animacao" })}
          />

          <EditorDePlacar
            animacoes={dados.animacoes}
            aoEscolherAnimacao={(campo) => definirEditando({ tipo: "animacaoDeRodada", campo })}
            aoLimparAnimacao={(campo) =>
              definirPreset((atual) => (atual ? { ...atual, [campo]: null } : atual))}
            aoMudarPortal={(vida) =>
              definirPreset((atual) => (atual ? { ...atual, portal: { ...atual.portal, vida } } : atual))}
            preset={preset}
            catalogo={dados.catalogo}
            presenteIdsEmSlot={new Set((preset?.slots ?? []).map((s) => String(s.presenteId)))}
            aoAdicionar={adicionarAoPlacar}
            aoMudar={mudarEfeitoDoPlacar}
            aoRemover={removerDoPlacar}
          />

          <MonitorAoVivo
            eventos={fluxo.eventos}
            naoMapeados={fluxo.naoMapeados}
            estado={fluxo.estado}
            conectado={fluxo.conectado}
            aoVincular={vincularNaoMapeado}
          />

          <TestadorDePresente
            preset={preset}
            catalogo={dados.catalogo}
            sessaoRodando={aoVivo}
            disparando={disparando}
            aoDisparar={testarPresentes}
          />
        </div>
      ) : null}

      {/* Duas colunas aqui, e não na página "Ao vivo": a prévia do mapa só faz
          sentido colada no que a gerou. */}
      {pagina === "configurar" ? (
        <div className="app-colunas">
          <section className="app-coluna">
            {/* Primeiro da página de propósito: é o único campo sem o qual a
                sessão não inicia. */}
            <ContaDaLive
              configuracao={dados.configuracao}
              salvando={salvandoConta}
              travado={aoVivo}
              aoSalvar={salvarConta}
            />

            {/* Antes da modalidade: numa máquina limpa não existe preset
                nenhum, e escolher a modalidade de um preset que não existe é
                configurar o nada. */}
            <GerenciadorDePresets
              presets={dados.presets}
              presetAtual={preset}
              travado={aoVivo}
              salvando={salvando}
              aoCriar={criarPreset}
              aoDuplicar={duplicarPreset}
              aoApagar={apagarPreset}
            />

            <SeletorModalidade
              modalidades={dados.modalidades}
              modalidade={preset?.modalidade ?? "escalada"}
              aoTrocar={(modalidade) => definirPreset((atual) => (atual ? { ...atual, modalidade } : atual))}
              travado={aoVivo}
            />

            <SeletorDeLook
              looks={dados.looks}
              lookId={preset?.personagem?.lookId ?? null}
              aoEscolher={(lookId) =>
                definirPreset((atual) => (atual ? { ...atual, personagem: { lookId } } : atual))}
              travado={aoVivo}
            />

            <SeletorDeMundo
              acervo={acervo}
              mapa={mapaEscolhido}
              montando={montandoMundo}
              erro={erroDeMapa}
              recado={recadoDoMundo}
              jogoOnline={jogoOnline}
              aoMontar={montarMundo}
            />
          </section>

          <aside className="app-coluna">
            <PreviaDeMapa mapa={mapaEscolhido} prontidao={prontidao} />

            {/* Colado na prévia de propósito: quando ela diz "ainda não pode ir
                ao ar", é aqui embaixo que está o motivo e o conserto (ADR-004). */}
            <PainelDeAcervo
              acervo={acervo}
              salvando={salvandoAcervo}
              erro={erroDeAcervo}
              publicando={publicandoAcervo}
              relatorio={relatorioDoAcervo}
              aoAnotar={anotarAcervo}
              aoPublicar={publicarAcervo}
            />
          </aside>
        </div>
      ) : null}

      {/* A página do Roblox: abrir o jogo e provar que as animações tocam. As
          duas coisas juntas porque são a mesma sessão de trabalho — abre,
          conecta, clica e vê. Nenhuma delas depende de sessão nem de preset. */}
      {pagina === "jogo" ? (
        <div className="app-pagina">
          <BotaoAbrirJogo
            abrindo={abrindoJogo}
            resultado={studio}
            erro={erroDoStudio}
            aoAbrir={abrirNoStudio}
          />

          <GaleriaDeSkins
            nicks={dados.configuracao?.galeriaDeSkins ?? []}
            espiada={skinEspiada}
            espiando={espiandoSkin}
            salvando={salvandoGaleria}
            aoEspiar={espiarSkin}
            aoAdicionar={(nick) => {
              salvarGaleria([...(dados.configuracao?.galeriaDeSkins ?? []), nick]);
              definirSkinEspiada(null);
            }}
            aoRemover={(nick) =>
              salvarGaleria((dados.configuracao?.galeriaDeSkins ?? []).filter((n) => n !== nick))}
          />

          <ControleDaPartida
            jogoOnline={jogoOnline}
            ocupado={comandandoPartida}
            ultimoRecado={recadoDaPartida}
            aoReiniciar={() => comandarPartida(() => api.reiniciarCorrida(), "Reiniciar")}
            aoZerarPlacar={() => comandarPartida(() => api.zerarPlacar(), "Zerar placar")}
            aoRecarregarMapa={() => comandarPartida(() => api.recarregarMapa(), "Recarregar mapa")}
          />

          <TestadorDeAnimacao
            animacoes={dados.animacoes}
            jogoOnline={jogoOnline}
            disparando={disparandoAnimacao}
            ultimaDisparada={ultimaAnimacao}
            aoDisparar={testarAnimacao}
          />
        </div>
      ) : null}

      {/* O histórico é a única página que olha para trás. Ela não tem nada que
          sirva durante a live, e por isso fica longe de "Ao vivo". */}
      {pagina === "historico" ? (
        <div className="app-pagina">
          <HistoricoDeSessoes
            sessoes={sessoes}
            carregando={carregandoSessoes}
            sessaoEscolhida={sessaoEscolhida}
            aoEscolher={definirSessaoEscolhida}
            aoAtualizar={carregarSessoes}
          />

          {/* O mesmo bloco que aparece no Stop, agora sobre uma live passada:
              o resumo é o mesmo objeto, venha ele da resposta do Stop ou do
              arquivo em disco. */}
          {sessaoEscolhida && (
            <ResumoDaLive
              sessao={(sessoes ?? []).find((s) => s.sessaoId === sessaoEscolhida) ?? null}
              titulo="Resumo desta live"
              aoFechar={() => definirSessaoEscolhida(null)}
            />
          )}
        </div>
      ) : null}

      {/*[[ Só existe um overlay hoje, o das cutscenes.

          Ele já funcionava; o que faltava era um lugar que dissesse a URL — ela
          vivia num comentário do servidor. A aba nasce com um só e com o
          desenho pronto para os próximos: cada overlay é um cartão. ]]*/}
      {pagina === "overlay" ? (
        <div className="app-pagina">
          <PainelDeOverlay />
        </div>
      ) : null}

      {pagina === "log" ? (
        <div className="app-pagina">
          <PainelDeLogs
            logs={fluxo.logs}
            aoLimpar={() => {
              fluxo.definirLogs([]);
              definirProblemasVistos(0);
            }}
          />
        </div>
      ) : null}

      <SeletorDePresente
        aberto={editando?.tipo === "presente"}
        catalogo={dados.catalogo}
        atualizando={atualizandoCatalogo}
        aoAtualizar={atualizarCatalogo}
        presenteIdAtual={slotEditado?.presenteId ?? null}
        presenteIdsUsados={(preset?.slots ?? [])
          .filter((s) => s.posicao !== editando?.posicao)
          .map((s) => s.presenteId)}
        aoEscolher={(presenteId) => {
          mudarSlot(editando.posicao, { presenteId });
          definirEditando(null);
        }}
        aoFechar={() => definirEditando(null)}
      />

      {/*[[ O MESMO seletor serve slot e fim de rodada.

          `editando.campo` diz onde a escolha vai cair: num slot dos seis, ou no
          `animacaoDeVitoria`/`animacaoDeDerrota` do preset. Um segundo modal
          divergiria do primeiro no primeiro ajuste de filtro. ]]*/}
      <SeletorDeAnimacao
        aberto={editando?.tipo === "animacao" || editando?.tipo === "animacaoDeRodada"}
        animacoes={dados.animacoes}
        animacaoIdAtual={
          editando?.tipo === "animacaoDeRodada"
            ? preset?.[editando.campo] ?? null
            : slotEditado?.animacaoId ?? null
        }
        deltaDoSlot={editando?.tipo === "animacaoDeRodada" ? null : slotEditado?.delta ?? null}
        aoEscolher={(animacaoId) => {
          if (editando?.tipo === "animacaoDeRodada") {
            const campo = editando.campo;
            definirPreset((atual) => (atual ? { ...atual, [campo]: animacaoId } : atual));
          } else {
            mudarSlot(editando.posicao, { animacaoId });
          }
          definirEditando(null);
        }}
        aoFechar={() => definirEditando(null)}
      />
    </main>
  );
}
