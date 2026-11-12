#!/usr/bin/env node
import fs from "node:fs";
import { loadMcpCatalog, searchMcpServers } from "./mcp/catalog";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, parseNumberFlag, CLI_HELP } from "./cli/args";
import { Renderer } from "./cli/render";
import { rendererCallbacks } from "./cli/callbacks";
import { startRepl } from "./cli/repl";
import { startTui } from "./tui/tui";
import { Runtime } from "./runtime";
import { loadConfig, defaultConfig, saveGlobalConfig, initProject, providerReady, listModelAliases, hardenConfigPermissions } from "./config/config";
import { buildRepoMap, renderRepoMap, repoMapSummary } from "./core/repo-map";
import { resolveVerifyCommand, runVerify, renderVerifyResult } from "./core/verify-runner";
import { globalConfigPath, projectConfigPath, globalXminalDir } from "./config/paths";
import { runDoctor, formatDoctor } from "./config/doctor";
import { Session } from "./core/session";
import { SkillRegistry, verifySkills, writeSkillsLock } from "./skills/loader";
import { installSkill } from "./skills/install";
import { McpManager } from "./mcp/client";
import { runRalph } from "./orchestration/ralph";
import { detectVerifyCommand } from "./tools/verify-tool";
import { startServer } from "./server/http";
import { startMcpStdioServer } from "./mcp/server";
import { startTelegram } from "./bridges/telegram";
import { verifyAudit, tailAudit } from "./cli/audit";
import { loadToolUsage } from "./core/tool-usage";
import { exists, truncateText } from "./util/fs";
import { ansi } from "./util/ansi";
import { VERSION, TAGLINE } from "./version";
import { refreshModelsCatalog, catalogMeta, MODEL_DEV_URL } from "./config/models-catalog";
import type { AgentCallbacks, AgentMode } from "./core/agent";
import type { PermissionMode } from "./config/types";
import { maskConfigSecrets } from "./util/redact";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // the global config holds provider keys → owner-only, every run
  try {
    hardenConfigPermissions();
  } catch {
    // never block startup on a chmod failure
  }
  if (args.flags["no-color"]) process.env.NO_COLOR = "1";
  if (typeof args.flags.permission === "string") process.env.XMINAL_PERMISSION_MODE = args.flags.permission;
  const cwd = typeof args.flags.cwd === "string" ? path.resolve(args.flags.cwd) : process.cwd();
  const renderer = new Renderer();

  if (args.flags.help || args.flags.h || args.command === "help" || (!args.command && args.flags.version)) {
    console.log(CLI_HELP);
    return;
  }
  if (args.flags.version || args.flags.v || args.command === "version") {
    console.log(`xminal ${VERSION} — ${TAGLINE}`);
    return;
  }

  switch (args.command) {
    case "init":
      commandInit(cwd, renderer);
      return;

    case "doctor":
      commandDoctor(cwd);
      return;

    case "models": {
      const sub = args.positionals[0]?.toLowerCase();
      if (sub === "refresh") {
        const result = await refreshModelsCatalog({ force: true });
        if (result.ok) {
          console.log(`catalog refreshed · ${result.modelCount} models (${result.freeCount} free) from models.dev · new: ${result.newModels}`);
          console.log(`source: ${MODEL_DEV_URL} · cache: ${result.cachePath}`);
        } else {
          console.error(`catalog refresh failed: ${result.error}`);
          process.exitCode = 1;
        }
        return;
      }
      commandModels(cwd, renderer);
      return;
    }

    case "sessions":
      commandSessions(cwd, renderer);
      return;

    case "skills": {
      if (args.positionals[0] === "install") {
        const target = args.positionals[1];
        if (!target) {
          console.error("Usage: xminal skills install <path|git-url> [--global]");
          process.exitCode = 1;
          return;
        }
        try {
          const result = installSkill(cwd, target, { global: Boolean(args.flags.global) });
          console.log(`installed skill ${result.name} → ${result.destination}`);
        } catch (error) {
          console.error((error as Error).message);
          process.exitCode = 1;
        }
        return;
      }
      if (args.flags.lock) {
        const count = writeSkillsLock(cwd);
        renderer.success(`skills lock written: ${count} skill(s) → ${path.join(cwd, ".xminal", "skills.lock.json")}`);
        return;
      }
      if (args.flags.verify) {
        const verification = verifySkills(cwd);
        const drift = [
          verification.added.length ? `+${verification.added.join(", ")}` : "",
          verification.changed.length ? `~${verification.changed.join(", ")}` : "",
          verification.removed.length ? `-${verification.removed.join(", ")}` : "",
        ].filter(Boolean).join(" ");
        if (verification.ok) {
          renderer.success(`skills lock OK · ${verification.total} skill(s) trusted (${verification.lockPath})`);
        } else {
          renderer.warn(`skills lock drift: ${drift || "unknown"} — run xminal skills --lock to trust`);
          process.exitCode = 1;
        }
        return;
      }
      const skills = new SkillRegistry(cwd).list();
      renderer.info(
        skills.length
          ? skills.map((skill) => `${skill.name} (${skill.source}) · ${skill.description}`).join("\n")
          : "(no skills installed)",
      );
      return;
    }

    case "mcp":
      if (args.flags.serve) {
        await startMcpStdioServer(cwd);
        return;
      }
      await commandMcp(cwd, renderer, args.positionals, args.flags);
      return;

    case "audit": {
      const which = args.positionals[0]?.toLowerCase();
      if (!which || which === "verify") {
        const result = verifyAudit(cwd);
        if (result.valid) {
          console.log(`audit chain valid · ${result.entries} entr${result.entries === 1 ? "y" : "ies"} (${path.join(cwd, ".xminal", "receipts", "audit.jsonl")})`);
        } else {
          console.error(`audit chain BROKEN at seq ${result.firstBrokenSeq ?? "?"}: ${result.reason ?? "unknown"}`);
          process.exitCode = 1;
        }
        return;
      }
      if (which === "tail") {
        const count = parseNumberFlag(args.flags, "tail", 10);
        for (const entry of tailAudit(cwd, count)) {
          console.log(`${entry.seq} · ${String(entry.ts ?? "").slice(0, 19)} · ${entry.action} · ${entry.decision}`);
        }
        return;
      }
      console.error(`Unknown audit action: ${which}. Use: xminal audit verify | xminal audit tail [--tail N]`);
      process.exitCode = 1;
      return;
    }

    case "config":
      commandConfig(cwd, args.positionals);
      return;

    case "verify": {
      // headless verification: run the project's own check and report it
      const { config } = loadConfig(cwd);
      const command = resolveVerifyCommand(cwd, config.verifyCommand);
      if (!command) {
        renderer.warn("no verify command detected for this project (set verifyCommand in the config)");
        process.exitCode = 1;
        return;
      }
      renderer.info(`verify: ${command}`);
      const result = runVerify(cwd, command, { timeoutMs: config.verifyTimeoutMs ?? 120_000 });
      renderer.info(renderVerifyResult(result));
      process.exitCode = result.passed ? 0 : 1;
      return;
    }

    case "map": {
      // the ranked repository map — what exists, without loading the repo
      const request = args.positionals.join(" ");
      const map = buildRepoMap(cwd, request);
      renderer.info(`repository map · ${repoMapSummary(map)}`);
      renderer.info(renderRepoMap(map, { maxChars: 8000 }) || "(no files found)");
      return;
    }

    case "worktree":
      commandWorktree(cwd, args.positionals, args.flags);
      return;

    case "serve":
      await commandServe(cwd, args);
      return;

    case "telegram":
      await commandTelegram(cwd, args);
      return;

    case "ralph":
      await commandRalph(cwd, args, renderer);
      return;

    case "run":
      // first run on a new machine: pull the live model catalog before the
      // first prompt, and say so — the user should see the few seconds wait
      if (!process.env.XMINAL_MODELS_OFFLINE) {
        const meta = catalogMeta();
        const fetchedAt = meta.fetchedAt ? Date.parse(meta.fetchedAt) : 0;
        const ttlHours = Number(process.env.XMINAL_MODELS_TTL_HOURS ?? "24");
        const stale = !fetchedAt || Date.now() - fetchedAt > Math.max(0, ttlHours) * 3600_000;
        if (stale) {
          renderer.info("updating model catalog — first run downloads the live models.dev list…");
          try {
            const result = await refreshModelsCatalog({ force: false });
            if (result.source === "fresh") {
              renderer.info(`model catalog updated · ${result.modelCount} models · ${result.freeCount} free`);
            }
          } catch {
            renderer.warn("model catalog update failed — using the bundled catalog");
          }
        }
      }
      await commandRun(cwd, args, renderer);
      return;

    case "resume": {
      const requested = args.positionals[0] || (typeof args.flags.session === "string" ? args.flags.session : undefined);
      let sessionId = requested;
      if (!sessionId || sessionId === "latest") sessionId = Session.latest(cwd)?.id;
      if (!sessionId) {
        renderer.warn("No sessions found; starting a new session.");
      }
      const runtime = new Runtime(cwd, {
        mode: modeFlag(args.flags.mode),
        model: stringFlag(args.flags.model) ?? stringFlag(args.flags.m),
        sessionId,
        newSession: !sessionId,
        callbacks: rendererCallbacks(renderer),
      });
      await startRepl(runtime, { renderer });
      return;
    }

    case "repl":
    default: {
      const runtime = new Runtime(cwd, {
        mode: modeFlag(args.flags.mode),
        model: stringFlag(args.flags.model) ?? stringFlag(args.flags.m),
        sessionId: stringFlag(args.flags.session),
        newSession: Boolean(args.flags.new) || !stringFlag(args.flags.session),
        callbacks: rendererCallbacks(renderer),
      });
      const wantTui = (process.stdin.isTTY && !args.flags["no-tui"]) || process.env.XMINAL_TUI === "1";
      if (wantTui) {
        if (process.env.XMINAL_TUI_ENGINE === "ink") {
          if (!process.stdin.isTTY) {
            renderer.warn("ink engine needs a TTY (alternate screen + raw keys); falling back to classic REPL.");
            await startRepl(runtime, { renderer });
            return;
          }
          try {
            // ESM-only bundle loaded dynamically — never require()s ink
            const { pathToFileURL } = require("node:url");
            const entryUrl = pathToFileURL(require("node:path").resolve(__dirname, "tui-ink/entry.mjs")).href;
            const inkEngine = await new Function("return import(arguments[0])")(entryUrl) as { startInkTui: (rt: unknown, opts: { cwd: string }) => Promise<void> };
            await inkEngine.startInkTui(runtime, { cwd });
            return;
          } catch (error) {
            renderer.warn(`ink engine failed (${(error as Error).message}); falling back to the built-in TUI.`);
            await startTui(runtime);
            return;
          }
        }
        if (process.env.XMINAL_TUI_ENGINE === "opencode") {
          const { isOpenCodeEngineSupported, runOpenCodeEngine } = await import("./tui/opencode-engine");
          if (isOpenCodeEngineSupported()) {
            try {
              const code = await runOpenCodeEngine(cwd);
              process.exit(code);
            } catch (error) {
              renderer.warn(`opencode engine failed (${(error as Error).message}); falling back to the built-in TUI.`);
              await startTui(runtime);
              return;
            }
            return;
          }
          renderer.warn("opencode engine is not supported on this platform (no android-arm64 native renderer); using the built-in TUI.");
        }
        try {
          await startTui(runtime);
          return;
        } catch (error) {
          renderer.warn(`TUI failed (${(error as Error).message}); falling back to classic REPL.`);
        }
      }
      {
        await startRepl(runtime, { renderer });
      }
      return;
    }
  }
}

function commandInit(cwd: string, renderer: Renderer): void {
  if (!exists(globalConfigPath())) {
    saveGlobalConfig(defaultConfig());
    renderer.success(`created ${globalConfigPath()}`);
  }
  const { configPath } = initProject(cwd);
  ensureGitignore(cwd);
  renderer.success(`created ${configPath}`);
  renderer.info(
    [
      `project: ${cwd}`,
      `global config: ${globalConfigPath()}`,
      "",
      "Next: set a provider key and run xminal doctor, e.g.",
      "  export OPENROUTER_API_KEY=sk-or-...",
      "  xminal doctor",
      "  xminal",
    ].join("\n"),
  );
}

function commandDoctor(cwd: string): void {
  const loaded = loadConfig(cwd);
  const checks = runDoctor(cwd, loaded);
  console.log(formatDoctor(checks));
  if (checks.some((check) => check.status === "fail")) process.exitCode = 1;
}

function commandModels(cwd: string, renderer: Renderer): void {
  const { config } = loadConfig(cwd);
  const lines = Object.entries(config.providers).map(([name, provider]) => {
    const status = providerReady(provider)
      ? provider.requiresKey === false
        ? ansi.cyan("free")
        : ansi.green("key")
      : ansi.gray("no key");
    return `  ${name.padEnd(12)} ${provider.type.padEnd(10)} ${(provider.baseUrl ?? "").padEnd(44)} ${status}`;
  });
  renderer.info(`providers:\n${lines.join("\n")}`);
  const aliases = listModelAliases(config);
  renderer.info(
    `default: ${config.defaultModel}\naliases: ${aliases.length} configured (showing 12): ${aliases.slice(0, 12).join(", ")}${aliases.length > 12 ? " …" : ""}`,
  );
  const meta = catalogMeta(config.models);
  renderer.info(
    `model catalog: ${meta.source} · ${meta.modelCount} models · ${meta.freeCount} free` +
      (meta.fetchedAt ? ` · fetched ${meta.fetchedAt}` : "") +
      `\nsource: ${MODEL_DEV_URL}\ncache: ${meta.cachePath}\nrun \`xminal models refresh\` to refresh from models.dev (auto every 24h)`,
  );
  renderer.info(`config: ${globalConfigPath()} · ${projectConfigPath(cwd)}`);
}

function commandSessions(cwd: string, renderer: Renderer): void {
  const sessions = Session.list(cwd);
  renderer.info(
    sessions.length
      ? sessions
          .slice(0, 50)
          .map(
            (meta) =>
              `${meta.id} · ${meta.updatedAt} · ${meta.model} · ${meta.messageCount} msg · ${meta.title}`,
          )
          .join("\n")
      : "(no sessions)",
  );
}

async function commandMcp(
  cwd: string,
  renderer: Renderer,
  positionals: string[] = [],
  flags: Record<string, string | boolean | undefined> = {},
): Promise<void> {
  // catalogue search: `xminal mcp search <query> [--platform mobile]`
  const parts = positionals.map((p) => String(p)).filter(Boolean);
  if (parts[0] === "search" || parts[0] === "catalog" || parts[0] === "find") {
    const platform = typeof flags.platform === "string" ? flags.platform : undefined;
    const query = parts.slice(1).join(" ");
    const catalog = loadMcpCatalog();
    if (!catalog) {
      renderer.warn("MCP catalog missing — run scripts/fetch-mcp-catalog.py to build data/mcp-catalog.json");
      return;
    }
    const hits = searchMcpServers(query, { platform, limit: 40 });
    renderer.info(
      `MCP catalog: ${catalog.count} servers (${catalog.source}) — ${hits.length} match "${query || "*"}"${platform ? ` · ${platform}` : ""}`,
    );
    for (const entry of hits) {
      renderer.status(`${entry.name} · ${entry.work}`);
      renderer.info(`   ${entry.id} · ${entry.platforms.join("/").toUpperCase()}${entry.remote ? " · HOSTED" : ""} · ${entry.url}`);
    }
    if (hits.length === 0) renderer.info("(no matches)");
    return;
  }
  const { config } = loadConfig(cwd);
  const servers = Object.keys(config.mcpServers);
  if (servers.length === 0) {
    renderer.info("(no MCP servers configured — add mcpServers to ~/.xminal/config.json)");
    return;
  }
  const mcp = new McpManager(config.mcpServers);
  try {
    const tools = await Promise.race([
      mcp.listAllTools(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), 15_000)),
    ]);
    renderer.info(`servers: ${servers.join(", ")}`);
    renderer.info(
      tools.length
        ? tools.map(({ server, tool }) => `${server}/${tool.name} · ${tool.description ?? ""}`).join("\n")
        : "(no tools reported)",
    );
  } finally {
    mcp.closeAll();
  }
}

function commandConfig(cwd: string, positionals: string[]): void {
  const which = positionals[0];
  // the config holds provider keys — never print them in full
  if (which === "global") {
    const file = globalConfigPath();
    console.log(
      fs.existsSync(file)
        ? JSON.stringify(maskConfigSecrets(JSON.parse(fs.readFileSync(file, "utf8"))), null, 2)
        : "(missing)",
    );
    return;
  }
  if (which === "project") {
    const file = projectConfigPath(cwd);
    console.log(
      fs.existsSync(file)
        ? JSON.stringify(maskConfigSecrets(JSON.parse(fs.readFileSync(file, "utf8"))), null, 2)
        : "(missing)",
    );
    return;
  }
  const loaded = loadConfig(cwd);
  console.log(
    JSON.stringify(
      {
        cwd,
        globalDir: globalXminalDir(),
        globalConfig: globalConfigPath(),
        projectConfig: projectConfigPath(cwd),
        projectConfigExists: loaded.projectExists,
        config: maskConfigSecrets(loaded.config),
      },
      null,
      2,
    ),
  );
}

function commandWorktree(
  cwd: string,
  positionals: string[],
  flags: Record<string, string | boolean>,
): void {
  const action = positionals[0] || "list";
  const pathArg = stringFlag(flags.path) ?? positionals[1];
  const branch = stringFlag(flags.branch) ?? positionals[2];
  const base = stringFlag(flags.base) ?? "HEAD";
  let gitArgs: string[];

  if (action === "list") {
    gitArgs = ["worktree", "list", "--porcelain"];
  } else if (action === "create") {
    if (!pathArg || !branch) {
      console.error("Usage: xminal worktree create <path> <branch> [--base ref]");
      process.exitCode = 1;
      return;
    }
    gitArgs = ["worktree", "add", "-b", branch, pathArg, base];
  } else if (action === "remove") {
    if (!pathArg) {
      console.error("Usage: xminal worktree remove <path> [--force]");
      process.exitCode = 1;
      return;
    }
    gitArgs = ["worktree", "remove", ...(flags.force ? ["--force"] : []), pathArg];
  } else if (action === "merge") {
    if (!branch) {
      console.error("Usage: xminal worktree merge <branch>");
      process.exitCode = 1;
      return;
    }
    gitArgs = ["merge", "--no-ff", branch];
  } else {
    console.error(`Unknown worktree action: ${action}`);
    process.exitCode = 1;
    return;
  }

  const result = spawnSync("git", gitArgs, { cwd, encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

async function commandServe(cwd: string, args: ReturnType<typeof parseArgs>): Promise<void> {
  const port = parseNumberFlag(args.flags, "port", 8787);
  const host = stringFlag(args.flags.host) ?? "127.0.0.1";
  const token = stringFlag(args.flags.token) ?? process.env.XMINAL_SERVER_TOKEN;
  const running = await startServer({
    cwd,
    host,
    port,
    token,
    mode: modeFlag(args.flags.mode),
    model: stringFlag(args.flags.model) ?? stringFlag(args.flags.m),
  });
  console.log(`xminal server listening on http://${host}:${port}`);
  console.log("  GET  /health · GET /v1/models · GET /v1/sessions");
  console.log("  POST /v1/agent · POST /v1/chat/completions (OpenAI-compatible)");
  if (token) console.log("  auth: Authorization: Bearer <token>");
  const shutdown = async () => {
    await running.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function commandTelegram(cwd: string, args: ReturnType<typeof parseArgs>): Promise<void> {
  const token = stringFlag(args.flags.token) ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("Telegram bot token required: --token <token> or TELEGRAM_BOT_TOKEN");
    process.exitCode = 1;
    return;
  }
  await startTelegram({
    cwd,
    token,
    mode: modeFlag(args.flags.mode),
    model: stringFlag(args.flags.model) ?? stringFlag(args.flags.m),
  });
}

async function commandRalph(
  cwd: string,
  args: ReturnType<typeof parseArgs>,
  renderer: Renderer,
): Promise<void> {
  const task = args.positionals.join(" ").trim() || args.prompt || "";
  if (!task) {
    console.error("Usage: xminal ralph <task> --verify <command> [--iterations N]");
    process.exitCode = 1;
    return;
  }
  const runtime = new Runtime(cwd, {
    mode: "build",
    model: stringFlag(args.flags.model) ?? stringFlag(args.flags.m),
    newSession: true,
    callbacks: rendererCallbacks(renderer),
  });
  try {
    const result = await runRalph(runtime, {
      task,
      verifyCommand: stringFlag(args.flags.verify) ?? runtime.config.verifyCommand ?? detectVerifyCommand(cwd),
      maxIterations: parseNumberFlag(args.flags, "iterations", 5),
      callbacks: rendererCallbacks(renderer),
    });
    renderer.flush();
    if (result.passed) {
      renderer.success(`Ralph passed in ${result.iterations} iteration(s) using: ${result.command}`);
      process.stdout.write(result.reports[result.reports.length - 1] + "\n");
    } else {
      renderer.error(`Ralph failed after ${result.iterations} iteration(s): ${result.command}`);
      if (result.lastOutput) renderer.info(truncateText(result.lastOutput, 6000));
      process.exitCode = 1;
    }
  } finally {
    runtime.close();
  }
}

async function commandRun(
  cwd: string,
  args: ReturnType<typeof parseArgs>,
  renderer: Renderer,
): Promise<void> {
  const prompt = args.prompt ?? args.positionals.join(" ");
  if (!prompt.trim()) {
    console.error('Usage: xminal run "your task" [--model provider/model] [--json]');
    process.exitCode = 1;
    return;
  }
  const quiet = Boolean(args.flags.quiet);
  const verbose = Boolean(args.flags.verbose);
  const json = Boolean(args.flags.json);

  const callbacks: AgentCallbacks = {
    onText: (text) => {
      if (verbose && !json) process.stderr.write(text);
    },
    onToolCall: (call) => {
      if (!quiet && !json) process.stderr.write(`\n● ${call.name}\n`);
    },
    onToolResult: (name, result) => {
      if (!quiet && !json) process.stderr.write(`  ${result.isError ? "✗" : "✓"} ${name}\n`);
    },
    onStatus: (message) => {
      if (!quiet && !json) process.stderr.write(`· ${message}\n`);
    },
  };

  const runtime = new Runtime(cwd, {
    mode: modeFlag(args.flags.mode),
    model: stringFlag(args.flags.model) ?? stringFlag(args.flags.m),
    sessionId: stringFlag(args.flags.session),
    newSession: !stringFlag(args.flags.session),
    callbacks,
  });
  try {
    if (verbose && !json) process.stderr.write("\n");
    const result = await runtime.agent.run(prompt);
    if (json) {
      const payload = {
        text: result.text,
        sessionId: runtime.session.id,
        model: result.model,
        turns: result.turns,
        cost: result.cost,
        stoppedReason: result.stoppedReason,
        error: result.error,
        toolUsage: loadToolUsage(cwd),
      };
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    } else {
      if (result.text.trim()) process.stdout.write(result.text.trimEnd() + "\n");
      if (result.error && !json) console.error(result.error);
      if (!quiet) {
        process.stderr.write(
          `\n${result.turns} turn(s) · ${result.cost.inputTokens} in / ${result.cost.outputTokens} out · $${result.cost.costUsd.toFixed(6)}\n`,
        );
      }
    }
    if (result.stoppedReason === "error" || result.stoppedReason === "budget") process.exitCode = 1;
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  } finally {
    runtime.close();
  }
}

function modeFlag(value: string | boolean | undefined): AgentMode | undefined {
  if (typeof value !== "string") return undefined;
  const modes: AgentMode[] = ["plan", "build", "compose", "review", "yolo"];
  if (!modes.includes(value as AgentMode)) {
    console.error(`Invalid --mode "${value}". Use: ${modes.join(", ")}`);
    process.exit(1);
  }
  return value as AgentMode;
}

function stringFlag(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function ensureGitignore(cwd: string): void {
  const file = path.join(cwd, ".gitignore");
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (current.split(/\r?\n/).some((line) => line.trim() === ".xminal/" || line.trim() === ".xminal")) return;
  const next = current === "" || current.endsWith("\n") ? current : current + "\n";
  fs.writeFileSync(file, `${next}.xminal/\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
