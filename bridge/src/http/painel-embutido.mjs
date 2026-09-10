/**
 * O painel servido de dentro do executável.
 *
 * No repositório o painel é o Vite em `:5173`, que encaminha `/api` para cá
 * (`panel/vite.config.js`). No executável portátil não existe Vite: o painel já
 * vem construído, embutido no exe, e é servido pela MESMA porta da `/api`. Isso
 * apaga o problema que o proxy do Vite existe para resolver — mesma origem, sem
 * CORS, e a ponte continua sem precisar autorizar origem nenhuma.
 *
 * Por que o painel NÃO é extraído para disco como o `data/` e o `game/`: ele é
 * programa, não dado. Extrair criaria uma cópia que o streamer pode editar ou
 * apagar sem perceber, e que ficaria velha quando ele trocasse o exe por uma
 * versão nova. Dentro do exe, painel e ponte não têm como ficar dessincronizados.
 *
 * Não importa `node:fs`: recebe os arquivos já lidos (ADR-003). Quem os lê do
 * disco é o `aplicativo.mjs`, uma vez, no arranque — são 500 KB, e servir de
 * memória tira o disco do caminho de toda navegação do painel.
 */


const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export function tipoDoArquivo(caminho) {
  const ponto = caminho.lastIndexOf(".");
  return (ponto === -1 ? null : TIPOS[caminho.slice(ponto).toLowerCase()]) ?? "application/octet-stream";
}

/**
 * Quanto tempo o navegador pode guardar.
 *
 * O Vite carimba um hash no nome de todo arquivo de `assets/`, então esse nome
 * NUNCA serve conteúdo diferente: pode ser guardado para sempre. O `index.html`
 * é o oposto — o nome é fixo e o conteúdo aponta para o hash da versão atual.
 * Guardá-lo faria o exe novo abrir o painel velho, pedindo um `assets/` que já
 * não está embutido: tela branca depois de atualizar.
 */
export function cacheDoArquivo(caminho) {
  return caminho.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache";
}

/** A chave do índice que responde a esta URL, ou `null`. */
export function resolverChave(caminhoDaUrl, chaves) {
  const limpo = decodeURIComponent(caminhoDaUrl).replace(/^\/+/, "");
  if (limpo === "" || limpo === "index.html") return chaves.has("index.html") ? "index.html" : null;
  return chaves.has(limpo) ? limpo : null;
}

/**
 * Monta o painel embutido a partir de um `Map<caminho, Buffer>`.
 *
 * Sem mapa (rodando do repositório), não monta nada e o Vite continua sendo
 * quem serve a tela.
 */
export function montarPainelEmbutido(app, arquivos = null) {
  if (!arquivos?.size) return false;

  const chaves = new Set(arquivos.keys());

  app.get(/.*/, (req, res, proximo) => {
    // `/api` e os overlays já foram montados antes; o que chega aqui e começa
    // com `/api` é 404 de verdade, e devolver HTML no lugar do JSON de erro
    // faria o painel engolir "rota não existe" como se fosse resposta boa.
    if (req.path.startsWith("/api/")) return proximo();

    // Recuo para o `index.html` só para navegação. Um `assets/` que não existe
    // precisa dar 404: devolver HTML no lugar de um .js vira erro de sintaxe no
    // console, que não diz nada sobre o arquivo estar faltando.
    const chave = resolverChave(req.path, chaves) ?? (req.accepts("html") ? "index.html" : null);
    if (!chave) return proximo();

    const conteudo = arquivos.get(chave);
    if (!conteudo) return proximo();

    res.setHeader("Content-Type", tipoDoArquivo(chave));
    res.setHeader("Cache-Control", cacheDoArquivo(chave));
    return res.send(conteudo);
  });

  return true;
}
