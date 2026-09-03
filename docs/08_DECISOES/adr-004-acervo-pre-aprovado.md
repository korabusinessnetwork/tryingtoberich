
## Nota de implementação — 2026-09-02: de onde sai a imagem

O ADR resolveu **quem escolhe** o asset e nunca resolveu **quem faz** a imagem.
Na prática isso travou o acervo inteiro: dos doze itens de upload, um céu e uma
textura tinham assetId. Todo mapa gerado saía com o mesmo céu e a mesma rocha —
e lia como defeito do gerador, quando o gerador estava escolhendo entre um.

O gargalo eram doze idas ao site do Roblox: criar a arte, subir, esperar a
moderação, achar o número, colar no painel. O ADR chamava isso de "trabalho
manual de véspera, não automatizável". Metade disso era verdade.

### O que é pago, medido
Geração de imagem por IA **não cabe no tier gratuito**. Os seis modelos de
imagem do Gemini respondem `429` com `limit: 0` para
`generate_content_free_tier_requests`. Custo estimado do acervo por essa via:
~36 imagens × US$ 0,039 ≈ **US$ 1,40 uma vez**, mais conta de cobrança com
cartão. Adiado por padrão (`memory/restrictions.md`), e o dono escolheu o
caminho gratuito.

### O que é grátis, e virou a decisão
1. **A imagem sai de código.** Textura e céu são ruído e gradiente — não
   precisam de modelo. `bridge/src/acervo/desenho.mjs` desenha as duas a partir
   das **tags** do item, e `png.mjs` escreve o arquivo com o `zlib` do Node,
   sem dependência nenhuma. A receita vir das tags é o que mantém o acervo como
   DADO: acrescentar uma textura é editar `acervo.json`, e o código não precisa
   saber que ela existe. Tag desconhecida cai no neutro.
2. **O upload é uma chamada de API.** O Open Cloud (`apis.roblox.com/assets/v1`)
   sobe Decal e devolve o assetId. **Não gasta Robux.** Exige uma chave de API
   gratuita (`ROBLOX_API_KEY` + `ROBLOX_CREATOR_ID` no `.env`).

### O que NÃO mudou
A moderação continua sendo do Roblox e continua assíncrona. O item entra como
`em-moderacao` e só vira `aprovado` quando eles disserem que sim — o mesmo
contrato de antes, com o mesmo schema. A alternativa rejeitada lá em cima
("Gemini gera imagem, upload automático via Open Cloud") foi rejeitada porque
*o mapa precisa estar pronto quando o streamer clica em gerar*, e isso segue
valendo: publicar o acervo é trabalho de véspera, num botão separado, e a
geração de mapa continua escolhendo só entre o que já está aprovado.

### Consequência
O visual é estilizado, não fotográfico — o que combina com uma torre de
plataformas coloridas. Se um dia o acervo pedir arte de verdade, o mesmo
publicador sobe imagem de arquivo sem mudar nada: o que ele recebe é um PNG.

**Limite conhecido:** o jogo põe a mesma imagem nas seis faces do `Sky`
(`construtorMapa.lua`, `aplicarCeu`), e por isso o céu é desenhado sem linha de
horizonte — um gradiente de baixo para cima apareceria também no teto e no chão
da caixa. Céu com seis faces distintas precisaria de seis assetIds por item, e
o `itemDeUpload` guarda um. Fica anotado como próximo passo.
