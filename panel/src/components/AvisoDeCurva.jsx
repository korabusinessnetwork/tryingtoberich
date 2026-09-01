import "./AvisoDeCurva.css";

/**
 * Aviso de vínculo fora da curva (R3, `docs/03_REGRAS_DE_NEGOCIO`).
 *
 * Componente pequeno e burro: só desenha o texto que `avisoDeCurva` e
 * `avisoDeDirecao` (`lib/regras.js`) calculam no cartão do slot. `aviso` nulo
 * não desenha nada — quem decide SE avisa é a regra, não este componente.
 *
 * A regra é literal: isso AVISA e NÃO BLOQUEIA. O vínculo presente→animação é
 * escolha explícita do streamer (ADR-007), e um presente de 1 moeda que
 * derruba tudo é uma piada boa de live — o desenho não pode ler como "você
 * errou". Por isso: sem vermelho, sem ícone de proibido, só
 * `--estado-atencao`, o mesmo "olha isso" que o resto do painel usa pra
 * chamar atenção sem travar nada.
 */
export function AvisoDeCurva({ aviso }) {
  if (!aviso) return null;

  return (
    <p className="aviso-de-curva" role="status">
      {/* Só para leitor de tela: quem enxerga já tem a cor e o ponto de
          atenção; quem não enxerga precisa do motivo de o texto ter
          aparecido no meio da tela. */}
      <span className="aviso-de-curva-rotulo">Atenção —</span>
      {aviso}
    </p>
  );
}
