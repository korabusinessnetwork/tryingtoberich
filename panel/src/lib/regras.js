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

/** R1 — o preset tem 6 posições, e slot vazio é válido. Sempre devolve 6. */
export const SLOTS = 6;

export function slotsDoPreset(preset) {
  const porPosicao = new Map((preset?.slots ?? []).map((slot) => [slot.posicao, slot]));
  return Array.from({ length: SLOTS }, (_, i) => porPosicao.get(i + 1) ?? { posicao: i + 1, vazio: true });
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
