/**
 * As regras de exibição do painel. Funções puras, sem React e sem rede — é o
 * que permite testá-las com `node --test` sem montar componente nenhum.
 *
 * Regra que atravessa este arquivo inteiro (R3): **o valor em moedas sugere,
 * nunca decide.** Ele ordena, colore e avisa. Nenhuma regra de jogo lê faixa.
 */

/* ---------------------------------------------------------------- */
/* ADR-009 — jogabilidade do mapa                                    */
/* ---------------------------------------------------------------- */

/**
 * Estas três constantes existem em três linguagens: aqui, em
 * `bridge/src/dominio/regras.mjs` e em `game/src/server/jogabilidade.lua`.
 * Duplicação assumida — o painel não importa do Node e o Luau não importa de
 * ninguém —, com um teste em `test/jogo.test.mjs` travando as três no mesmo
 * número. Divergência aqui não quebra nada visivelmente: o painel só mostraria
 * uma barra mentindo sobre um mapa que a ponte já aprovou.
 */
export const FATOR_SALTO_VERTICAL = 0.7;
export const GRAVIDADE_ROBLOX = 196.2;
export const VELOCIDADE_ANDAR_ROBLOX = 16;

/** Teto de espaçamento entre plataformas. ADR-009.1. */
export const tetoVertical = (jumpHeight) => jumpHeight * FATOR_SALTO_VERTICAL;

/**
 * Quanto o personagem cobre na horizontal durante um pulo, já com a margem do
 * ADR-009. O Roblox dá controle total no ar, então é velocidade de andar vezes
 * o tempo de voo.
 */
export function alcanceHorizontalDoPulo(jumpHeight) {
  const velocidadeVertical = Math.sqrt(2 * GRAVIDADE_ROBLOX * jumpHeight);
  const tempoDeVoo = (2 * velocidadeVertical) / GRAVIDADE_ROBLOX;
  return VELOCIDADE_ANDAR_ROBLOX * tempoDeVoo * FATOR_SALTO_VERTICAL;
}

/* ---------------------------------------------------------------- */
/* R3 — o valor sugere, nunca decide                                 */
/* ---------------------------------------------------------------- */

/** Espelha `faixaDeMoedas` de bridge/src/dominio/regras.mjs. Ver R3. */
export function faixaDeMoedas(moedas) {
  if (moedas >= 5000) return 5;
  if (moedas >= 1000) return 4;
  if (moedas >= 100) return 3;
  if (moedas >= 10) return 2;
  return 1;
}

/** Nome da variável CSS da faixa. As cores vivem em styles/tokens.css, gerado. */
export const corDaFaixa = (faixa) => `var(--faixa-${faixa})`;

export const NOME_DA_FAIXA = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V" };

/** Delta sempre com sinal: o `+` é o que diferencia subida de descida de relance. */
export const formatarDelta = (delta) => (delta > 0 ? `+${delta}` : String(delta));

/**
 * R3 — aviso de vínculo fora da curva. **Avisa, não bloqueia.**
 *
 * A curva é uma expectativa grosseira: presente caro tende a mover mais. Mas o
 * vínculo é escolha explícita do streamer (ADR-007), e ele pode querer
 * justamente o contrário — um presente de 1 moeda que derruba tudo é uma piada
 * boa de live. Por isso o retorno é um texto para mostrar, nunca um booleano
 * que trave o salvar.
 *
 * Devolve `null` quando está dentro do esperado.
 */
export function avisoDeCurva({ moedas, delta }) {
  if (!Number.isFinite(moedas) || !Number.isFinite(delta) || delta === 0) return null;

  const faixa = faixaDeMoedas(moedas);
  const forca = Math.abs(delta);

  // Faixas I e II são presentes de 1 a 99 moedas: eles chegam em rajada, e um
  // delta grande neles faz o boneco atravessar o mapa por centavos.
  //
  // O número acompanhou a torre. Eram 50 quando ela tinha 1000 andares — 5%
  // dela. Com 5000, 50 é 1%, e o aviso passaria a aparecer em quase todo slot
  // barato: aviso que aparece sempre é ruído, e ruído some da vista junto com
  // o aviso que importava.
  if (faixa <= 2 && forca >= 250) {
    return `${forca} plataformas por ${moedas} ${moedas === 1 ? "moeda" : "moedas"} é muito para um presente barato — ele chega em rajada.`;
  }

  // Faixa V é o presente mais caro do catálogo. Delta pequeno nele decepciona
  // quem pagou, e decepção some com o próximo presente caro.
  if (faixa >= 4 && forca <= 3) {
    return `${moedas} moedas para mover ${forca} ${forca === 1 ? "plataforma" : "plataformas"} vai decepcionar quem mandar.`;
  }

  return null;
}

/**
 * A direção efetiva é o sinal do delta, não a animação (R2).
 *
 * O painel avisa quando os dois discordam, e permite mesmo assim: animação de
 * subida com delta negativo é escolha válida, só é quase sempre engano.
 */
export function avisoDeDirecao({ animacao, delta }) {
  if (!animacao || !Number.isFinite(delta) || delta === 0) return null;
  const subindo = delta > 0;
  if (animacao.direcao === "subida" && !subindo) {
    return "Animação de subida com delta negativo: o boneco desce enquanto o efeito sobe.";
  }
  if (animacao.direcao === "descida" && subindo) {
    return "Animação de descida com delta positivo: o boneco sobe enquanto o efeito desce.";
  }
  return null;
}

/**
 * As animações que o painel pode OFERECER, das que a ponte serviu.
 *
 * `/api/animacoes` serve a biblioteca inteira de propósito, aposentadas
 * incluídas: preset salvo pode apontar para uma delas e o cartão do slot precisa
 * do nome para mostrar. Filtrar é trabalho de quem oferece escolha. Mesma
 * divisão que o catálogo já faz com `presente.ativo`.
 *
 * `emUso` é a escapatória: a animação já escolhida naquele slot continua na
 * lista mesmo aposentada. Sem isso o slot apareceria sem nada selecionado, e o
 * streamer trocaria a animação sem perceber que estava trocando.
 *
 * `ativa` ausente conta como ativa: um `data/animacoes.json` gerado antes desta
 * coluna existir não pode esvaziar o seletor inteiro.
 */
export function animacoesOferecidas(animacoes, emUso) {
  if (!Array.isArray(animacoes)) return [];
  const guardadas = emUso instanceof Set ? emUso : new Set(emUso ? [emUso] : []);
  return animacoes.filter((animacao) => animacao?.ativa !== false || guardadas.has(animacao?.id));
}

/** Quantas a biblioteca tem aposentadas. Serve para a tela não mentir sobre o tamanho dela. */
export function contarAposentadas(animacoes) {
  if (!Array.isArray(animacoes)) return 0;
  return animacoes.filter((animacao) => animacao?.ativa === false).length;
}

/**
 * As cutscenes que o painel pode OFERECER, e a escolhida que sumiu do disco.
 *
 * A lista vem da PASTA, não de um cadastro (ADR-014): o streamer põe o vídeo
 * lá e ele aparece. O preset pode apontar para um arquivo que saiu da pasta
 * depois — renomeado, apagado, máquina trocada. Escondê-lo deixaria o
 * `<select>` sem seleção, e o próximo clique trocaria a escolha sem o streamer
 * perceber. Mesma regra de `animacoesOferecidas` para a aposentada: ele volta,
 * marcado `ausente: true`, para a tela dizer o que aconteceu.
 */
export function opcoesDeCutscene(cutscenes, escolhida) {
  const lista = Array.isArray(cutscenes) ? cutscenes : [];
  const opcoes = lista
    .filter((cutscene) => typeof cutscene?.id === "string")
    .map((cutscene) => ({ id: cutscene.id, arquivo: cutscene.arquivo ?? cutscene.id, ausente: false }));
  if (typeof escolhida === "string" && escolhida && !opcoes.some((opcao) => opcao.id === escolhida)) {
    opcoes.push({ id: escolhida, arquivo: escolhida, ausente: true });
  }
  return opcoes;
}

/**
 * O nome que o streamer digita vira o id que o arquivo usa.
 *
 * O `identificador` de `comuns.schema.json` é `^[a-z0-9][a-z0-9-]*$`: sem
 * espaço, sem acento, sem barra — porque ele vira nome de arquivo em disco
 * (ADR-003). "Escalada da Madrugada" precisa virar "escalada-da-madrugada"
 * ANTES de sair do painel, senão a ponte recusa o preset com um erro de
 * schema que não diz o que fazer.
 *
 * Devolve string vazia quando não sobra nada aproveitável (nome só de
 * emoji, só de pontuação): quem chama trata isso como "ainda não dá para
 * criar", que é diferente de mandar um id inválido para a ponte.
 */
export function idDePreset(nome) {
  return String(nome ?? "")
    // Separa o acento da letra (NFD) e joga fora só a marca: "ç" vira "c",
    // "ã" vira "a". Trocar por "-" perderia a letra inteira.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    // Traço na ponta não passa no padrão (ele exige começar em [a-z0-9]) e é
    // feio no nome do arquivo.
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

/**
 * R1 emendada — 6 é o PADRÃO, não o teto.
 *
 * Os seis primeiros vêm do painel de desejos da TikTok: são as posições que o
 * espectador enxerga na live, e por isso continuam existindo na tela mesmo
 * vazias (R1.3). É por isso que o piso é 6 e não a contagem real de slots —
 * esconder o slot 4 porque ninguém o preencheu tiraria da vista justamente o
 * lugar onde o streamer procura o presente.
 *
 * O teto de 24 é o `maxItems` de `data/schemas/preset.schema.json`: passar
 * dali a ponte devolve 400 `preset_invalido`, então o painel nem oferece.
 */
export const SLOTS_PADRAO = 6;
export const SLOTS_MAX = 24;

/**
 * As posições a desenhar: os 6 de sempre, mais os extras que este preset tem.
 *
 * Devolve até a MAIOR posição usada, não até a contagem de slots: remover o
 * extra 8 de [7, 8, 9] tem de deixar um cartão vazio no 8, porque a posição
 * viaja para `sessao.eventos` e para `presentesPorSlot` — renumerar os extras
 * reescreveria a que slot um evento já gravado se refere.
 */
export function slotsDoPreset(preset) {
  const porPosicao = new Map();
  for (const slot of preset?.slots ?? []) {
    // O preset também é editado à mão em disco (ADR-003). Posição fracionária
    // ou negativa nunca casaria com o índice e já sumia antes; o que é novo é
    // o teto: sem ele, um `posicao: 5000` digitado errado pediria cinco mil
    // cartões e travaria a aba antes de o streamer ver o erro.
    if (!Number.isInteger(slot?.posicao) || slot.posicao < 1 || slot.posicao > SLOTS_MAX) continue;
    porPosicao.set(slot.posicao, slot);
  }

  const maior = porPosicao.size > 0 ? Math.max(...porPosicao.keys()) : 0;
  const total = Math.max(SLOTS_PADRAO, maior);
  return Array.from({ length: total }, (_, i) => porPosicao.get(i + 1) ?? { posicao: i + 1, vazio: true });
}

/** Extra é o que passou do painel de desejos: ele ganha o botão de remover de vez. */
export const ehSlotExtra = (posicao) => Number.isInteger(posicao) && posicao > SLOTS_PADRAO;

/**
 * A próxima posição livre, ou `null` quando o preset já bateu no teto.
 *
 * Procura a partir do 1 de propósito: se o streamer limpou o slot 3 e depois
 * acrescentou um presente, o buraco no meio dos 6 é preenchido antes de nascer
 * um sétimo cartão — cartão vazio à vista com uma linha nova embaixo é a
 * mesma informação ocupando o dobro da tela.
 */
export function proximaPosicaoLivre(preset) {
  const ocupadas = new Set((preset?.slots ?? []).map((slot) => slot.posicao));
  for (let posicao = 1; posicao <= SLOTS_MAX; posicao += 1) {
    if (!ocupadas.has(posicao)) return posicao;
  }
  return null;
}

/**
 * O presente que pode entrar num slot novo: o primeiro do catálogo que ainda
 * não está vinculado a NADA neste preset.
 *
 * Slots e placar na mesma varredura, como a R1.4 que a ponte aplica
 * (`bridge/src/dominio/regras.mjs`). Olhando só os slots, um presente de
 * vitória já vinculado voltaria como padrão do slot novo e o Salvar devolveria
 * `presente_repetido` — falando de dois slots, enquanto a colisão real está no
 * placar, que esta tela nem mostra ao lado. `null` quando não sobrou nenhum.
 */
export function primeiroPresenteLivre(catalogo, preset) {
  const jaVinculado = new Set(
    [...(preset?.slots ?? []), ...(preset?.placar ?? [])].map((vinculo) => String(vinculo?.presenteId)),
  );
  return (
    listaDePresentes(catalogo).find(
      (presente) => presente?.presenteId != null && !jaVinculado.has(String(presente.presenteId)),
    ) ?? null
  );
}

/** R1.4 — o mesmo presente não pode ocupar dois slots. A ponte recusa; o painel avisa antes. */
export function presentesRepetidos(preset) {
  const vistos = new Set();
  const repetidos = new Set();
  for (const slot of preset?.slots ?? []) {
    if (vistos.has(slot.presenteId)) repetidos.add(slot.presenteId);
    vistos.add(slot.presenteId);
  }
  return [...repetidos];
}

/* ---------------------------------------------------------------- */
/* ADR-012 — combate de presentes                                    */
/* ---------------------------------------------------------------- */

const numeroOuZero = (valor) => (Number.isFinite(valor) ? valor : 0);

const contarParticipantes = (valor) => {
  if (Array.isArray(valor)) return valor.length;
  return Number.isFinite(valor) ? valor : null;
};

/**
 * Normaliza os dois formatos de combate do ADR-012 numa leitura só.
 *
 * Eles chegam por caminhos diferentes de propósito: disputa contestada vem
 * junto de um presente que moveu o boneco, e empate exato vem sozinho, porque
 * delta 0 não existe no contrato com o jogo. Quem desenha não deveria precisar
 * saber disso.
 *
 * Devolve `null` para presente comum — combate de um lado só não é disputa:
 * ninguém brigou, e mostrar "disputa" ali gastaria a etiqueta à toa.
 *
 * Mora aqui e não no componente porque é regra do ADR, não desenho: o HUD do
 * jogo faz a mesma leitura em Luau, e uma delas divergir mostraria coisas
 * diferentes nas duas telas para o mesmo evento.
 */
export function combateDoEvento(evento) {
  if (evento?.anulado) {
    return {
      empate: true,
      somaSubida: numeroOuZero(evento.somaSubida),
      somaDescida: numeroOuZero(evento.somaDescida),
      liquido: 0,
      participantes: contarParticipantes(evento.participantes),
    };
  }

  const disputa = evento?.disputa;
  if (!disputa?.contestado) return null;

  return {
    empate: false,
    somaSubida: numeroOuZero(disputa.somaSubida),
    somaDescida: numeroOuZero(disputa.somaDescida),
    liquido: Number.isFinite(disputa.liquido) ? disputa.liquido : numeroOuZero(evento.delta),
    participantes: contarParticipantes(disputa.participantes),
  };
}

/* ---------------------------------------------------------------- */
/* Latência — o Princípio nº1                                        */
/* ---------------------------------------------------------------- */

/**
 * Mediana, não média.
 *
 * Um pico isolado de 3s arrastaria a média em 300ms e pintaria o painel de
 * vermelho com nove presentes dentro do prazo. A mediana descreve o que a
 * plateia está sentindo; o pico aparece na faixa de amostras, ao lado.
 */
export function medianaDeLatencia(valores) {
  const validos = (valores ?? []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (validos.length === 0) return null;

  const meio = Math.floor(validos.length / 2);
  return validos.length % 2 === 0 ? (validos[meio - 1] + validos[meio]) / 2 : validos[meio];
}

/** Milissegundos como o streamer lê de canto de olho: inteiro, com unidade. */
export const formatarLatencia = (ms) => (Number.isFinite(ms) ? `${Math.round(ms)}ms` : "—");

/**
 * O orçamento do Princípio nº1: alvo de 600ms, teto de 1000ms. O painel
 * mostra a latência medida com essa leitura, para o streamer ver degradação
 * antes de o espectador reclamar.
 */
export function saudeDaLatencia(ms) {
  if (!Number.isFinite(ms)) return "desconhecida";
  if (ms <= 600) return "ok";
  if (ms <= 1000) return "atencao";
  return "erro";
}

/**
 * A lista de presentes, venha ela como array ou como envelope.
 *
 * `api.catalogo()` devolve o envelope inteiro. Aceitar os dois formatos evita
 * que a fiação da tela decida o desenho do componente — e mora aqui, e não
 * dentro de um componente, porque mais de um precisa dela.
 */
export function listaDePresentes(catalogo) {
  if (Array.isArray(catalogo)) return catalogo;
  return catalogo?.presentes ?? [];
}

/* ---------------------------------------------------------------- */
/* ADR-016 — a tabela de movimento                                   */
/* ---------------------------------------------------------------- */

/**
 * O padrão da tabela, igual ao de `bridge/src/dominio/movimento.mjs`.
 *
 * Terceira duplicação assumida do painel (as outras estão em cima): o painel
 * não importa do Node. O teste de `panel/test/regras.test.mjs` trava o número
 * 10 e o da ponte trava o mesmo — se um dia divergirem, a tela mostra um delta
 * e o jogo anda outro, que é o pior tipo de bug para descobrir ao vivo.
 */
export const MOVIMENTO_PADRAO = {
  ativo: true,
  multiplicador: 10,
  animacaoDeSubida: "sub_lanca_raios",
  animacaoDeDescida: "des_punho_impacto",
  intensidade: 2,
};

/** O bloco do preset com os buracos preenchidos. Preset sem tabela mostra o padrão. */
export function movimentoDoPreset(preset) {
  const bloco = preset?.movimento ?? {};
  return { ...MOVIMENTO_PADRAO, ...bloco, excecoes: bloco.excecoes ?? [] };
}

/** A regra sozinha: moedas × multiplicador. Espelha `deltaDaRegra` da ponte. */
export function deltaDaRegra(moedas, multiplicador) {
  const valor = Number.isFinite(moedas) ? Math.max(0, Math.trunc(moedas)) : 0;
  const fator = Number.isFinite(multiplicador) ? Math.max(0, Math.trunc(multiplicador)) : 0;
  return valor * fator;
}

/**
 * Uma linha por presente do catálogo: quanto ele anda hoje, e de onde esse
 * número veio.
 *
 * A ORIGEM é o que a tela precisa dizer, e são três:
 *
 * - `slot` — o presente é um dos 6. O delta é o do slot e a tabela não encosta
 *   nele (ADR-016). A linha aparece assim mesmo, porque "por que este não
 *   segue a regra?" é a primeira pergunta de quem olha a lista.
 * - `excecao` — o streamer escreveu o número à mão.
 * - `regra` — saiu da conta.
 *
 * Ordenado por valor, do mais caro para o mais barato, como o resto do painel.
 */
export function linhasDeMovimento(catalogo, preset) {
  const movimento = movimentoDoPreset(preset);
  const excecoes = new Map(
    movimento.excecoes
      .filter((e) => typeof e?.presenteId === "string" && Number.isInteger(e?.delta))
      .map((e) => [e.presenteId, e.delta]),
  );
  const slots = new Map((preset?.slots ?? []).map((slot) => [String(slot.presenteId), slot]));

  return listaDePresentes(catalogo)
    .filter((presente) => typeof presente?.presenteId === "string")
    .map((presente) => {
      const slot = slots.get(presente.presenteId);
      const excecao = excecoes.get(presente.presenteId);
      const daRegra = deltaDaRegra(presente.moedas, movimento.multiplicador);

      return {
        presenteId: presente.presenteId,
        nome: presente.nome ?? presente.presenteId,
        moedas: Number.isFinite(presente.moedas) ? presente.moedas : 0,
        faixa: presente.faixa ?? faixaDeMoedas(presente.moedas ?? 0),
        iconeUrl: presente.iconeUrl ?? null,
        iconeLocal: presente.iconeLocal ?? null,
        ativo: presente.ativo !== false,
        origem: slot ? "slot" : excecao !== undefined ? "excecao" : "regra",
        slot: slot?.posicao ?? null,
        delta: slot ? slot.delta : (excecao ?? daRegra),
        daRegra,
      };
    })
    .sort((a, b) => b.moedas - a.moedas || a.nome.localeCompare(b.nome));
}

/**
 * Escreve — ou apaga — a exceção de um presente.
 *
 * Delta igual ao da regra APAGA a exceção em vez de gravar o mesmo número: o
 * preset só guarda o que foge da conta, e é isso que faz o multiplicador
 * continuar valendo para quem nunca foi tocado. Zero é diferente de "igual à
 * regra" e vira exceção de verdade — é como se silencia um presente.
 */
export function comExcecao(preset, presenteId, delta, daRegra = null) {
  const movimento = movimentoDoPreset(preset);
  const outras = movimento.excecoes.filter((e) => e?.presenteId !== presenteId);
  if (delta === daRegra) return { ...movimento, excecoes: outras };
  return { ...movimento, excecoes: [...outras, { presenteId, delta }] };
}

/** Devolve o presente para a regra: some da lista de exceções. */
export function semExcecao(preset, presenteId) {
  const movimento = movimentoDoPreset(preset);
  return { ...movimento, excecoes: movimento.excecoes.filter((e) => e?.presenteId !== presenteId) };
}

/**
 * Quantos presentes a tabela move, e quanto pesa o maior deles.
 *
 * O resumo existe por causa de uma consequência que só aparece na conta: com
 * multiplicador 10, um presente de 44.999 moedas empurra 449.990 andares numa
 * torre de 1.000. O jogo grampeia o destino nas pontas, então isso não quebra
 * nada — mas é o fim da corrida num presente só, e o streamer precisa ver esse
 * número antes da live, não durante.
 */
export function resumoDaTabela(linhas, totalPlataformas) {
  const queMovem = linhas.filter((linha) => linha.delta !== 0);
  const maior = queMovem.reduce(
    (atual, linha) => (Math.abs(linha.delta) > Math.abs(atual?.delta ?? 0) ? linha : atual),
    null,
  );
  const teto = Number.isFinite(totalPlataformas) && totalPlataformas > 0 ? totalPlataformas : null;

  return {
    movem: queMovem.length,
    parados: linhas.length - queMovem.length,
    excecoes: linhas.filter((linha) => linha.origem === "excecao").length,
    maior,
    // Quantos presentes sozinhos já dão a torre inteira. Sem mapa gerado não
    // há torre para comparar, e aí a conta não é feita em vez de ser inventada.
    varremATorre: teto === null ? null : queMovem.filter((linha) => Math.abs(linha.delta) >= teto).length,
  };
}

/* ---------------------------------------------------------------- */
/* Estúdio de overlay — a geometria da caixa arrastável              */
/* ---------------------------------------------------------------- */

/**
 * Prende a caixa dentro do palco e arredonda a uma casa.
 *
 * Duas coisas, e as duas por consequência real. Sair do palco não dá erro: dá
 * um elemento desenhado fora da cena, que no OBS simplesmente não aparece e o
 * streamer descobre ao vivo. E o arredondamento existe porque o `x` vem de uma
 * conta de pixel do ponteiro — sem ele o arquivo guardaria `37.41999999999996`,
 * que é ruído para quem for ler o JSON à mão depois.
 *
 * O teto é `100 - tamanho`, não 100: `x` e `y` são o canto SUPERIOR ESQUERDO
 * do elemento, então prender só a origem deixaria a caixa inteira pendurada
 * para fora. Caixa mais larga que o palco fica em 0 em vez de virar negativa.
 */
export function prenderNoPalco({ x, y, largura = 0, altura = 0 }) {
  const dentro = (valor, tamanho) => {
    if (!Number.isFinite(valor)) return 0;
    const teto = Math.max(0, 100 - (Number.isFinite(tamanho) ? tamanho : 0));
    return Math.min(teto, Math.max(0, valor));
  };
  const casa = (valor) => Math.round(valor * 10) / 10;

  return { x: casa(dentro(x, largura)), y: casa(dentro(y, altura)) };
}

/** Escreve a exceção de um elemento do overlay, preservando o que já havia nela. */
export function layoutComElemento(elementos, id, campos) {
  const atual = elementos?.[id] ?? {};
  return { ...elementos, [id]: { escala: 1, visivel: true, ...atual, ...campos } };
}

/**
 * Devolve o elemento ao padrão da página — APAGANDO a chave, não gravando a
 * posição padrão nela.
 *
 * É a mesma escolha do `semExcecao` da tabela (ADR-016), e pela mesma razão:
 * o arquivo guarda só o que o streamer mexeu. Gravar a posição padrão faria o
 * layout congelar o desenho de hoje — no dia em que a página do OBS mudar de
 * lugar um elemento, quem clicou "voltar ao padrão" uma vez ficaria preso no
 * padrão velho, sem nada dizendo por quê.
 */
export function semElemento(elementos, id) {
  const resto = { ...elementos };
  delete resto[id];
  return resto;
}

/**
 * A caixa encosta na faixa da cam? (ADR-015)
 *
 * Aviso, nunca bloqueio: quem decide o enquadramento é o streamer, e a cam
 * pode estar em outro lugar da cena dele. Mas nada é desenhado sobre a cam de
 * propósito — um elemento ali fica atrás do rosto, e a live inteira passa com
 * o placar escondido sem ninguém perceber.
 */
export function invadeACam(caixa, cam) {
  const faixa = Number.isFinite(cam) ? cam : 0;
  if (faixa <= 0) return false;
  const topo = Number.isFinite(caixa?.y) ? caixa.y : 0;
  const base = topo + (Number.isFinite(caixa?.altura) ? caixa.altura : 0);
  return topo < faixa && base > 0;
}

/**
 * As duas leituras da resposta de `GET /api/overlay/layout`: o CATÁLOGO do que
 * existe e as EXCEÇÕES do que o streamer mexeu.
 *
 * Existe porque as duas pontas chamam de `elementos` coisas diferentes. O
 * 07_APIS, que é normativo, diz `elementos` = o que o streamer moveu, com o
 * catálogo ao lado; a rota de hoje devolve `{ layout: { elementos }, elementos:
 * [o catálogo], cam }`. Lendo uma forma só, o estúdio abre com o palco VAZIO e
 * anunciando "8 fora do padrão" sem ninguém ter arrastado nada — e sem nenhum
 * erro na tela, porque tecnicamente a chamada deu certo. Aceitar as duas é o
 * que faz a tela funcionar hoje e continuar funcionando no dia em que a rota
 * se alinhar à doc.
 *
 * A forma é reconhecida pelo TIPO, não pela presença da chave: catálogo é
 * lista, exceção é mapa de id para posição.
 */
export function lerRespostaDoLayout(resposta) {
  const catalogoEmElementos = Array.isArray(resposta?.elementos);
  const excecoes = catalogoEmElementos ? resposta?.layout?.elementos : resposta?.elementos;
  const ehMapa = excecoes != null && typeof excecoes === "object" && !Array.isArray(excecoes);

  return {
    catalogo: resposta?.catalogo ?? (catalogoEmElementos ? resposta.elementos : null),
    elementos: ehMapa ? excecoes : {},
  };
}

/**
 * A âncora pela qual o CSS da página prende o elemento HOJE, em texto de tela.
 *
 * Quem não nasce preso pela esquerda e pelo topo troca de âncora no primeiro
 * arrastar e dá um pulo (02_DESIGN_SYSTEM, seção C). O catálogo da ponte diz
 * quem é assim e promete que "o painel avisa" — este é o texto do aviso.
 * Âncora desconhecida devolve `null`: aviso inventado sobre um elemento novo
 * seria pior que aviso nenhum.
 */
const ANCORAS_QUE_PULAM = {
  "direita-topo": "à direita",
  "direita-base": "à direita e à base",
  "esquerda-base": "à base",
  "centro-topo": "pelo centro",
  "faixa-topo": "pela largura inteira",
};

export function avisoDeAncora(ancora) {
  return ANCORAS_QUE_PULAM[ancora] ?? null;
}
