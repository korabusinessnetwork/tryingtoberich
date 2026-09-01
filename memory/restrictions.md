# Restrições — Kora Stream Games

## Restrições de custo (fase bootstrap gratuito)
- Nenhum serviço pago aprovado. Gemini roda em tier gratuito.
- Cloudflare Tunnel na modalidade gratuita (URL muda a cada reinício se não for
  túnel nomeado; usar túnel nomeado para ter URL fixa, ainda gratuito).
- Roblox: experiência privada, sem custo. Upload de asset é gratuito.
- Ao esbarrar em limite de tier gratuito, apresentar alternativa antes de sugerir
  plano pago. O dono decide.

## Restrições técnicas (impostas pelas plataformas, não negociáveis)
- **Roblox HttpService só faz requisição de saída.** Não recebe webhook, não
  aceita conexão de entrada, não alcança `localhost` nem IP privado.
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
