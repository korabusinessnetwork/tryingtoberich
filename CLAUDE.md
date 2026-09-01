# Diretrizes de Desenvolvimento — Kora Stream Games

> Constituição do projeto. Leia antes de qualquer mudança relevante.
> Projeto da Kora Business Network. Dono: Matheus Bonato.

## Princípio nº 1 — LATÊNCIA PERCEBIDA (inegociável)

O produto é um jogo reagindo a uma live. O valor inteiro morre se o espectador
manda o presente e o boneco reage 3 segundos depois: ele não associa a ação ao
próprio presente e para de mandar. **Orçamento total: presente na TikTok até
primeiro frame de animação no Roblox em menos de 1000ms**, alvo de 600ms.

Regras práticas derivadas:

- Nada de polling com intervalo fixo. A ponte usa long-poll (ver ADR-002).
- Nenhuma operação de disco, chamada de IA ou escrita de log pode ficar no
  caminho crítico do evento de presente. Tudo isso é fire-and-forget.
- Presente com o boneco livre dispara **na hora**. Nada de janela de espera na
  entrada. Concorrência se resolve no **combate** (ADR-012), que só existe
  enquanto uma animação está tocando.
- Animação começa no instante do evento. O cálculo de destino pode terminar
  depois do início do efeito visual.
- Toda feature nova responde: "isso entra no caminho crítico?" Se sim, medir.

## Fonte de verdade (leia antes de qualquer mudança relevante)

- **`memory/`** — identidade, decisões, padrões, aprendizados, restrições, bugs.
- **`docs/`** — visão, arquitetura, design system, regras de negócio, modelagem,
  fluxos, componentes, APIs, ADRs (`08_DECISOES/`), backlog, prompts, segurança.
- **ADR-001** define a stack vigente. Toda decisão de arquitetura vira ADR.
- Schemas dos arquivos JSON: `data/schemas/`.
- Se doc e código conflitarem, **a documentação prevalece** e deve ser corrigida
  quando estiver errada.
- **Produto = single-tenant agora, multi-tenant no roadmap.** Nada de marca,
  nick, canal ou regra do Matheus hardcodada no código. Todo modelo persistido
  já nasce com `streamerId`, mesmo que hoje seja sempre `"local"`. Ver ADR-003.

## Processo de trabalho

1. **Planejar TUDO antes de executar.** Escopo fechado, sem retrabalho.
2. Builds multi-parte usam fan-out paralelo com **dono exclusivo por diretório**.
   Os três processos (`game/`, `bridge/`, `panel/`) são donos independentes e
   dois agentes nunca tocam o mesmo arquivo.
3. **Sintetizar e VALIDAR no fim.** Revisar cada entrega, rodar teste e build.
4. Tarefa de peça única não ganha fan-out.

## Custo — priorizar o gratuito (bootstrap gratuito)

Projeto em pré-receita. **Use sempre meios gratuitos.** Toda implementação que
exija investimento é **adiada por padrão**, salvo decisão explícita do dono.
Ao esbarrar em algo pago, apresente custo aproximado, alternativa gratuita,
impacto e recomendação (agora × depois). O dono decide.
Detalhes em `memory/restrictions.md`.

## Segurança (obrigatório em todo código novo)

- **Nunca** hardcodar chave, URL de túnel, token ou secret. Usar `.env`
  (`process.env.*` no Node, `import.meta.env.VITE_*` no painel).
- A chave do Gemini vive **só no processo Node**. O painel nunca a vê e nunca
  chama a API do Gemini direto do navegador.
- O endpoint público da ponte exige `X-Bridge-Token` em toda requisição. Sem
  token, 401. Ver `docs/11_SEGURANCA`.
- **Sempre** validar o payload que chega do Roblox e do painel antes de usar.
- **Nunca** logar nickname junto com identificador persistente do espectador.
  Log de evento guarda tipo de presente e valor, não a pessoa.
- Nenhum dado de espectador é retido além da sessão (ver LGPD em `11_SEGURANCA`).

## Padrões de código

- Componentes React em arquivos separados, um por arquivo, com CSS próprio.
- **Separar CSS do JSX.** Estilo desacoplado da marcação, para white-label.
- Nomes de domínio em português (`dispararAnimacao`, `montarPreset`), padrões
  técnicos em inglês (`handleSubmit`, `useEffect`).
- Toda chamada de rede tratada com `try/catch` ou checagem explícita de erro.
- Logs de atividade fire-and-forget, nunca bloqueiam a operação principal.
- Acesso a arquivo JSON **nunca** acontece direto no componente ou na rota.
  Passa sempre pela camada de repositório em `bridge/src/repos/`. Ver ADR-003.
- No Luau: um ModuleScript por animação, nenhum `wait()` solto, nenhum efeito
  criado dentro de loop de render.
- Rodar `npm test` antes de commitar. Função pura nasce com teste.

## Stack

- **Jogo:** Roblox / Luau (Roblox Studio, experiência privada)
- **Ponte:** Node.js + tiktok-live-connector + Express + Cloudflare Tunnel
- **Painel:** React + Vite (roda local, `localhost`)
- **Dados:** arquivos JSON em disco, sem banco (ADR-003)
- **IA:** Google Gemini API (tier gratuito), chamada só pelo Node
- **Deploy:** nenhum. Tudo local. Só a ponte é exposta via túnel.
