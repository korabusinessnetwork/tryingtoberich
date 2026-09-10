#!/usr/bin/env node
// Instala o Stop hook do Full Automático num projeto.
// Uso: node instalar-hook.js <pasta-do-projeto> [--com-protecoes]
// Faz merge no .claude/settings.json sem apagar configurações existentes.

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const projeto = path.resolve(args.find((a) => !a.startsWith("--")) || ".");
const comProtecoes = args.includes("--com-protecoes");

const pastaClaude = path.join(projeto, ".claude");
const pastaHooks = path.join(pastaClaude, "hooks");
const destinoHook = path.join(pastaHooks, "full-auto-stop.js");
const arquivoSettings = path.join(pastaClaude, "settings.json");

fs.mkdirSync(pastaHooks, { recursive: true });
fs.copyFileSync(path.join(__dirname, "full-auto-stop.js"), destinoHook);
for (const extra of ["full-auto-limite.js", "vigia-limite.js"]) {
  fs.copyFileSync(path.join(__dirname, extra), path.join(pastaHooks, extra));
}

let settings = {};
if (fs.existsSync(arquivoSettings)) {
  try {
    settings = JSON.parse(fs.readFileSync(arquivoSettings, "utf8"));
  } catch (e) {
    console.error(`settings.json inválido em ${arquivoSettings}. Corrija o JSON e rode de novo.`);
    process.exit(1);
  }
  fs.copyFileSync(arquivoSettings, arquivoSettings + ".bak");
}

settings.hooks = settings.hooks || {};
settings.hooks.Stop = settings.hooks.Stop || [];

const jaTem = JSON.stringify(settings.hooks.Stop).includes("full-auto-stop.js");
if (!jaTem) {
  settings.hooks.Stop.push({
    hooks: [
      {
        type: "command",
        command: "node",
        args: ["${CLAUDE_PROJECT_DIR}/.claude/hooks/full-auto-stop.js"],
      },
    ],
  });
}

// Paralelismo: worktrees partem do trabalho atual, não da main.
settings.worktree = settings.worktree || {};
if (!settings.worktree.baseRef) settings.worktree.baseRef = "head";

// Copia arquivos de ambiente para cada worktree criada.
const arquivoInclude = path.join(projeto, ".worktreeinclude");
if (!fs.existsSync(arquivoInclude)) {
  fs.writeFileSync(arquivoInclude, ".env\n.env.local\n");
}

// Limite de uso: quando o turno cai por rate_limit, liga o vigia.
settings.hooks.StopFailure = settings.hooks.StopFailure || [];
if (!JSON.stringify(settings.hooks.StopFailure).includes("full-auto-limite.js")) {
  settings.hooks.StopFailure.push({
    matcher: "rate_limit",
    hooks: [
      {
        type: "command",
        command: "node",
        args: ["${CLAUDE_PROJECT_DIR}/.claude/hooks/full-auto-limite.js"],
      },
    ],
  });
}

if (comProtecoes) {
  settings.permissions = settings.permissions || {};
  const adicionar = (lista, regras) => {
    settings.permissions[lista] = settings.permissions[lista] || [];
    for (const r of regras) {
      if (!settings.permissions[lista].includes(r)) settings.permissions[lista].push(r);
    }
  };
  adicionar("deny", ["Bash(git push --force *)", "Bash(git push -f *)"]);
  adicionar("ask", [
    "Bash(git push *)",
    "Bash(supabase db push *)",
    "Bash(vercel --prod *)",
    "Bash(npm publish *)",
  ]);
}

fs.writeFileSync(arquivoSettings, JSON.stringify(settings, null, 2) + "\n");

console.log(`Hook ${jaTem ? "já estava instalado" : "instalado"}: ${destinoHook}`);
console.log(`settings.json atualizado: ${arquivoSettings}`);
console.log("Vigia de limite instalado (StopFailure rate_limit → checagem a cada 10 min).");
console.log(`Paralelismo: worktree.baseRef = ${settings.worktree.baseRef}, .worktreeinclude pronto.`);
if (comProtecoes) console.log("Travas de segurança adicionadas (deny + ask).");
console.log("Reinicie a sessão do Claude Code (ou abra /hooks) para o hook ser carregado.");
