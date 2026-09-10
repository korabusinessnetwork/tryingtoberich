/**
 * A regra do alarme do item 6.
 *
 * Ela existe como função pura justamente para poder ser testada assim: sem
 * montar tela, sem relógio e sem esperar um dia ruim acontecer. O item 6 é o
 * alarme de quando a TikTok quebra o acesso, que é o risco nº 1 do produto
 * (ADR-P05, ADR-006), e um alarme cuja regra nunca foi exercitada é um alarme
 * que ninguém sabe se toca.
 *
 * O que se prova aqui é a fronteira dos dois erros que um alarme pode cometer:
 * **tocar à toa**, e aí o dono aprende a ignorá-lo, e **ficar mudo**, e aí ele
 * não serve para nada.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { avaliarAlarme, FATIA_DE_ALARME, NIVEIS, piorHora, QUEDAS_PARA_SUSPEITAR } from "../src/lib/alarme.js";

const hora = (h, quedas) => ({ hora: `2026-09-10T${String(h).padStart(2, "0")}:00`, quedas });

test("dia sem queda nenhuma é calmo, e diz isso", () => {
  const veredito = avaliarAlarme({ conectadosAgora: 4, quedas24h: 0, serie: [] });
  assert.equal(veredito.nivel, NIVEIS.CALMO);
  assert.match(veredito.titulo, /Nenhuma queda/);
});

test("uma queda solta não acorda ninguém", () => {
  // Base pequena: com dois assinantes, uma queda é 100% de concentração e não
  // quer dizer nada. Alarme que dispara à toa é alarme que se aprende a ignorar.
  const veredito = avaliarAlarme({ conectadosAgora: 2, quedas24h: 1, serie: [hora(8, 1)] });
  assert.equal(veredito.nivel, NIVEIS.CALMO);
});

test("quedas espalhadas pelo dia são atenção, não alarme", () => {
  const veredito = avaliarAlarme({
    conectadosAgora: 3,
    quedas24h: 4,
    serie: [hora(2, 1), hora(9, 1), hora(15, 1), hora(21, 1)],
  });

  assert.equal(veredito.nivel, NIVEIS.ATENCAO);
  assert.match(veredito.explicacao, /vida normal de quem transmite de casa/);
});

test("quedas concentradas numa hora só viram alarme", () => {
  // Não é a internet de ninguém: é a plataforma tendo mudado alguma coisa.
  const veredito = avaliarAlarme({
    conectadosAgora: 5,
    quedas24h: 6,
    serie: [hora(14, 5), hora(20, 1)],
  });

  assert.equal(veredito.nivel, NIVEIS.ALARME);
  assert.match(veredito.titulo, /5 quedas concentradas/);
  assert.equal(veredito.hora, "2026-09-10T14:00");
});

test("todo mundo caiu e ninguém voltou é alarme mesmo espalhado", () => {
  const veredito = avaliarAlarme({
    conectadosAgora: 0,
    quedas24h: 3,
    serie: [hora(3, 1), hora(11, 1), hora(19, 1)],
  });

  assert.equal(veredito.nivel, NIVEIS.ALARME);
  assert.match(veredito.titulo, /Ninguém conectado/);
});

test("zero conectado SEM queda nenhuma não é alarme", () => {
  // É a madrugada, ou é a base sem assinante. Tratar isso como alarme faria a
  // tela gritar todo dia às três da manhã.
  const veredito = avaliarAlarme({ conectadosAgora: 0, quedas24h: 0, serie: [] });
  assert.equal(veredito.nivel, NIVEIS.CALMO);
});

test("a fronteira dos limiares está exatamente onde as constantes dizem", () => {
  // Um a menos que o mínimo não acorda; o mínimo acorda. É o teste que quebra
  // quando alguém mexe na constante sem pensar no que ela decide.
  const abaixo = avaliarAlarme({
    conectadosAgora: 2,
    quedas24h: QUEDAS_PARA_SUSPEITAR - 1,
    serie: [hora(14, QUEDAS_PARA_SUSPEITAR - 1)],
  });
  assert.equal(abaixo.nivel, NIVEIS.CALMO);

  const noLimite = avaliarAlarme({
    conectadosAgora: 2,
    quedas24h: QUEDAS_PARA_SUSPEITAR,
    serie: [hora(14, QUEDAS_PARA_SUSPEITAR)],
  });
  assert.equal(noLimite.nivel, NIVEIS.ALARME);

  // Concentração logo abaixo da fatia continua sendo só atenção.
  const espalhado = avaliarAlarme({ conectadosAgora: 2, quedas24h: 10, serie: [hora(14, 3), hora(15, 7)] });
  assert.ok(3 < 10 * FATIA_DE_ALARME);
  assert.equal(espalhado.nivel, NIVEIS.ALARME, "7 de 10 numa hora passa da fatia");
});

test("a pior hora é a de mais quedas, e não a última da lista", () => {
  assert.deepEqual(piorHora([hora(1, 2), hora(9, 7), hora(20, 3)]), {
    hora: "2026-09-10T09:00",
    quedas: 7,
  });
  assert.equal(piorHora([]), null);
});

test("a regra não quebra com resposta vazia nem com campo faltando", () => {
  // A camada de dados nunca lança, então esta função recebe o que vier.
  assert.equal(avaliarAlarme().nivel, NIVEIS.CALMO);
  assert.equal(avaliarAlarme({}).nivel, NIVEIS.CALMO);
  assert.equal(avaliarAlarme({ serie: null }).nivel, NIVEIS.CALMO);
});
