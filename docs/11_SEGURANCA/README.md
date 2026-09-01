# 11 — Segurança

## Superfície de exposição
Só **uma** coisa deste sistema fica na internet: as rotas `/jogo/*` da ponte,
publicadas pelo Cloudflare Tunnel. Tudo mais (painel, rotas `/api/*`, arquivos
de dados, chave do Gemini) vive em `localhost`.

Regra dura: **o túnel publica apenas o prefixo `/jogo`.** Se a configuração do
túnel apontar para a raiz, as rotas do painel vazam para a internet sem
autenticação. Isso é o pior cenário possível neste projeto.

## Camada 1 — Rede
- Túnel Cloudflare nomeado, apontando exclusivamente para `/jogo`.
- Rotas `/api/*` fazem bind em `127.0.0.1`, nunca em `0.0.0.0`.
- Header `X-Bridge-Token` obrigatório em `/jogo/*`. Sem token ou token errado: 401.
- Token gerado com no mínimo 32 bytes aleatórios, guardado em `.env`.
- Rate limit simples em `/jogo/*`: o Roblox legítimo faz cerca de 3 requisições
  por minuto. Qualquer coisa acima de 60/min é abuso.

## Camada 2 — Segredos
- `GEMINI_API_KEY` e `BRIDGE_TOKEN` só no `.env` do Node.
- `.env` no `.gitignore`. Um `.env.example` sem valor real fica versionado.
- O painel **nunca** recebe a chave do Gemini. Toda chamada de IA passa pela ponte.
- Nenhuma chave, token ou URL de túnel dentro de script Luau versionado.

## Camada 3 — Validação de entrada
- Payload do Roblox (`POST /jogo/estado`) validado: inteiro, dentro do tamanho
  do mapa. Valor fora da faixa é descartado, não corrige o estado.
- Payload do painel (preset) validado contra as regras R1 e R2 antes de gravar.
- Saída do Gemini validada contra schema, com verificação de acervo (ver P1).
- Nome de doador vindo da TikTok é tratado como texto não confiável: sanitizado
  antes de virar texto na tela do jogo, com limite de tamanho.

## Camada 4 — Dado de terceiro (LGPD)
O sistema recebe dado de pessoas que não são o usuário: nickname e evento de
presente de espectadores.

Regras:
- **Nada de nickname em log persistido.** O nome do doador vai para a tela do
  jogo e para o SSE do painel, ambos em memória e efêmeros.
- O log de evento da sessão guarda tipo de presente, valor, delta e latência.
  Não guarda quem enviou.
- Ao encerrar a sessão (F5), o arquivo em `data/sessoes/` é reduzido ao resumo
  agregado. O detalhe por evento é descartado.
- Nenhum identificador de espectador é cruzado entre sessões.
- Base legal: legítimo interesse para exibição ao vivo, com retenção zero.

## Camada 5 — Termos de plataforma
Risco documentado em ADR-006: a captura de evento usa biblioteca não oficial.
- Fase 1: uso pessoal, não comercial. Aceito pelo dono.
- Antes da Fase 3 (produto para terceiros), este item é **bloqueante** e precisa
  ser resolvido pela via oficial ou reavaliado formalmente.
No Roblox: experiência privada, sem monetização interna, sem troca de valor real
dentro do jogo. Manter assim.

## Checklist de definição de pronto
- [ ] Túnel publica só `/jogo`, verificado com requisição externa a `/api/presets`
      que deve retornar erro de rota, não dado
- [ ] `X-Bridge-Token` exigido e testado com token errado
- [ ] `/api/*` só responde em `127.0.0.1`
- [ ] `.env` fora do git, `.env.example` dentro
- [ ] Chave do Gemini ausente de todo bundle do painel (verificar o build)
- [ ] Nenhum nickname em arquivo de `data/`
- [ ] Sessão encerrada some com o detalhe por evento
- [ ] Nome de doador sanitizado antes de virar texto no jogo
- [ ] `fs` não aparece fora de `bridge/src/repos/`
