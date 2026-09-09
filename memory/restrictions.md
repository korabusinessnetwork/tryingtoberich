# Restrições — Kora Stream Games

## Restrições de custo (fase bootstrap gratuito)
- Nenhum serviço pago aprovado. Gemini roda em tier gratuito.
- Cloudflare Tunnel na modalidade gratuita (URL muda a cada reinício se não for
  túnel nomeado; usar túnel nomeado para ter URL fixa, ainda gratuito).
- Roblox: experiência privada, sem custo. Upload de asset é gratuito.
- Ao esbarrar em limite de tier gratuito, apresentar alternativa antes de sugerir
  plano pago. O dono decide.

## Restrições técnicas (impostas pelas plataformas, não negociáveis)
- **Roblox HttpService só faz requisição de saída.** Não recebe webhook e não
  aceita conexão de entrada. Isso vale sempre e é a razão de existir o long-poll.
- **"Não alcança `localhost`" NÃO está verificado para o Roblox Studio.** Vale
  para servidor publicado, que roda em datacenter. O Studio roda na mesma
  máquina que a ponte. Se alcançar, o túnel do ADR-002 vira opcional e o
  caminho crítico encurta bastante. Ver a questão em aberto no ADR-002.
- **Limite do HttpService:** cerca de 500 requisições por minuto por servidor.
- **HttpService precisa ser ligado** em Game Settings → Security.
- **Upload de roupa clássica no Roblox custa 80 Robux por submissão** (desde
  14/07/2026), cobrado no envio, aprovado ou não, mais 10 Robux de adiantamento
  para vender. Exige verificação de identidade. Apenas vestir não exige Premium.
  Por isso a Fase 1 usa composição gratuita. Ver ADR-010.
- **Todo asset visual do Roblox passa por moderação** antes de virar ID usável.
  Isso impede imagem gerada por IA em tempo real. Ver ADR-004.
- **A TikTok não oferece API pública de evento de presente** para criador comum.
  A captura depende de biblioteca não oficial. Ver ADR-006.
- **A TikTok penaliza live que pareça automatizada.** Tela estática, ausência de
  presença humana e conteúdo que roda sozinho reduzem alcance e podem encerrar a
  transmissão. Consequência de design: o jogo precisa ser **jogado ativamente**,
  e o mapa precisa ser vencível só com habilidade. Ver ADR-009. Esta restrição
  tem prioridade sobre qualquer ideia de mecânica que crie tempo parado.
- **A TikTok limita a 6 os presentes** exibidos como desejo na live. O produto
  respeita esse número por definição de produto, não por limitação técnica.
- Catálogo de presentes da TikTok muda sem aviso. Valores não podem ser
  hardcodados no código. Ver `docs/04_MODELAGEM/catalogo-presentes.md`.

## Restrições legais
- **LGPD:** o sistema recebe nickname e evento de presente de terceiros. Retenção
  máxima é a sessão da live. Nada de nickname em log persistido.
- **Termos da TikTok:** a biblioteca de captura de evento não é oficial. Uso
  pessoal e não comercial na Fase 1. Antes de virar produto (Fase 3), avaliar a
  via oficial de parceiro de jogo da TikTok. Ver ADR-006.
- **Termos do Roblox:** a experiência é privada e não monetiza dentro do Roblox.
  Nenhum valor real é trocado dentro do jogo. Manter assim.

## Restrições de escopo da Fase 1
- Uma modalidade só. O seletor de modalidade existe, mas com um item.
- Sem multi-streamer, sem auth, sem banco.
- Sem espectador jogando. Só o boneco do streamer se move.

---

## Restrições da camada de produto (registradas em 2026-09-09)

Abertas pelo `docs/00_VISAO/plano-de-produto.md`. Valem a partir da Fase 1.

### Custo — o que é gratuito, e o gatilho exato de upgrade
**Custo fixo da Fase 1: US$ 0.** Nenhum serviço pago foi aprovado, e a regra de
custo do `CLAUDE.md` continua valendo. Levantado em 2026-09-09:

| Serviço | Tier grátis | Limite | Só pagar quando |
|---|---|---|---|
| EulerStream (API gerenciada da TikTok) | Community, US$ 0 para sempre | 25 WebSockets simultâneos, 2.500 req/dia | Passar de **25 lives simultâneas** → Business, US$ 50/mês (100 WebSockets) |
| Supabase | Free | 500 MB, 50k MAU, 5 GB egress, 2 projetos | Passar de 500 MB ou 5 GB/mês → Pro, US$ 25/mês |
| Lemon Squeezy | sem mensalidade | — | Nunca. Só taxa por venda |
| Roblox | — | roda na máquina do cliente | Nunca |

**O erro de modelagem a não cometer:** a API gerenciada cobra **conexão
simultânea, não assinante**. Streamers não ficam ao vivo todos ao mesmo tempo,
então 25 WebSockets grátis cobrem uma base bem maior que 25 pessoas.

Taxas do Lemon Squeezy, que não são custo fixo mas entram na conta: 5% + US$ 0,50
por transação, +0,5% em assinatura, +1,5% em cartão internacional, +3% em venda
por afiliado, e **1% de payout para conta bancária internacional** — o que
inclui conta brasileira.

### Restrições legais novas, criadas por vender
- **A ressalva do ADR-006 saiu do papel.** Ele dizia "uso pessoal e não
  comercial na Fase 1" e "bloqueia a Fase 3 como está". O plano de produto é
  essa fase. A reavaliação formal que o ADR-006 exigiu virou o **ADR-P06**, que
  está **Proposto e aguarda decisão do dono**. Não vender antes de lê-lo.
- **A API gerenciada não resolve termos.** Ela mitiga a quebra técnica. A
  EulerStream é o mesmo acesso não oficial, gerenciado por um terceiro.
- **Termos do Roblox:** desenvolvedor não pode usar serviço de fora para vender
  item, recurso exclusivo ou melhoria de dentro da plataforma. O desenho do
  ADR-P04 fica fora dessa proibição porque **o que se vende é o software local
  que fala com a TikTok**, não conteúdo do place. Isso só continua verdade
  enquanto **nenhuma licença destravar conteúdo dentro do jogo** — regra dura,
  vale para toda modalidade futura.
- **O código Luau viaja com o produto.** No desenho do Studio, quem compra lê os
  53 arquivos. Não há proteção possível, e o fosso é a ponte e o serviço.
- **LGPD com tabela remota.** A telemetria do ADR-P02 herda a regra de sempre —
  evento guarda tipo de presente e valor, nunca a pessoa — e errar nela custa
  mais caro por ser dado fora da máquina do streamer.

### Restrição técnica que subiu de prioridade
- **O `HttpService` do Studio alcança `127.0.0.1`?** Continua sem resposta desde
  o Bloco 1. Com o ADR-P04 apostando o produto no Studio, isso deixou de ser
  curiosidade: se alcançar, some o Cloudflare Tunnel do produto inteiro, some o
  passo mais frágil do instalador e some cerca de um terço do orçamento de
  latência — para todo cliente. Cinco minutos de teste. É o F0-7.
