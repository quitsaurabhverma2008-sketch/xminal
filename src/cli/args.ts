export interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
  prompt?: string;
}

const VALUE_FLAGS = new Set([
  "model",
  "m",
  "mode",
  "session",
  "permission",
  "max-turns",
  "verify",
  "iterations",
  "port",
  "host",
  "token",
  "cwd",
  // value-taking flags (space form: --platform mobile, --tail 20)
  "platform",
  "tail",
  "limit",
  "max-cost",
  "p",
]);

const BOOLEAN_FLAGS = new Set([
  "new",
  "json",
  "quiet",
  "verbose",
  "help",
  "h",
  "version",
  "v",
  "no-color",
  "stream",
  "no-tui",
]);

const KNOWN_COMMANDS = new Set([
  "run",
  "repl",
  "init",
  "doctor",
  "models",
  "sessions",
  "resume",
  "serve",
  "ralph",
  "worktree",
  "skills",
  "mcp",
  "config",
  "verify",
  "map",
  "spec",
  "skill",
  "version",
  "help",
  "telegram",
  "audit",
]);

export function parseArgs(argv: string[]): ParsedArgs {
  let command = "";
  let index = 0;
  if (argv[0] && !argv[0].startsWith("-")) {
    if (KNOWN_COMMANDS.has(argv[0])) {
      command = argv[0];
      index = 1;
    } else {
      command = "run";
    }
  }

  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let prompt: string | undefined;

  for (; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (arg === "-p") {
      prompt = argv[++index] ?? "";
      continue;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = (eq === -1 ? arg.slice(2) : arg.slice(2, eq)).toLowerCase();
      if (eq !== -1) {
        flags[name] = arg.slice(eq + 1);
      } else if (VALUE_FLAGS.has(name)) {
        flags[name] = argv[++index] ?? "";
      } else if (BOOLEAN_FLAGS.has(name)) {
        flags[name] = true;
      } else {
        flags[name] = true;
      }
      continue;
    }
    if (arg.startsWith("-") && arg.length === 2) {
      const name = arg.slice(1).toLowerCase();
      if (VALUE_FLAGS.has(name)) flags[name] = argv[++index] ?? "";
      else flags[name] = true;
      continue;
    }
    positionals.push(arg);
  }

  if (!command) command = prompt ? "run" : "repl";
  if (!prompt && command === "run" && positionals.length > 0) prompt = positionals.join(" ");
  return { command, positionals, flags, prompt };
}

export function parseNumberFlag(flags: Record<string, string | boolean>, name: string, fallback: number): number {
  const value = flags[name];
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const CLI_HELP = `XMINAL — provider-agnostic terminal coding agent

Usage:
  xminal                          start the interactive REPL
  xminal "fix the failing test"   one-shot autonomous run
  xminal run [prompt] [flags]     non-interactive run
  xminal resume [session-id]      resume a session (default: latest)
  xminal init                     initialize .xminal in this project
  xminal doctor                   diagnose providers, sandbox, skills, MCP
  xminal models                   list providers, credentials, aliases, catalog status
  xminal models refresh            fetch latest model catalog from models.dev
  xminal sessions                 list sessions
  xminal ralph <task> --verify <cmd> [--iterations N]
  xminal worktree <list|create|remove|merge> [options]
  xminal serve [--port 8787] [--host 127.0.0.1] [--token T]
  xminal telegram [--token T]
  xminal skills | mcp [--serve] | config | audit [verify|tail] | version | help
  xminal verify                   run the project's verify command (headless)
  xminal map [query]              ranked repository map (file signatures)

Flags:
  -m, --model <provider/model|alias>   model selection (default: auto)
      --mode <plan|build|compose|review|yolo>
      --permission <ask|auto|full>
      --session <id>                    load a session
      --new                             force a new session
      --max-turns <n>
      --json                            JSON output for run
      --quiet                           suppress status output
      --no-color                        disable ANSI colors
  -p, --prompt <text>                   prompt for run

Environment:
  OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY,
  GROQ_API_KEY, DEEPSEEK_API_KEY, MISTRAL_API_KEY, XMINAL_MODEL,
  XMINAL_PERMISSION_MODE, TELEGRAM_BOT_TOKEN

Files:
  ~/.xminal/config.json   global config
  .xminal/config.json     project config
  .xminal/sessions/       session transcripts
  ~/.agents/skills/       skills (SKILL.md folders)`;
