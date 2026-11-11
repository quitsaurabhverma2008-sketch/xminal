import { spawnSync } from "node:child_process";
import { loadMcpCatalog, searchMcpServers } from "../mcp/catalog";
import fs from "node:fs";
import path from "node:path";
import { initProject, listModelAliases, providerReady, resolveModel } from "../config/config";
import { formatDoctor, runDoctor } from "../config/doctor";
import { projectTodosPath } from "../config/paths";
import { verifyAudit, tailAudit } from "./audit";
import { loadToolUsage, formatTokens } from "../core/tool-usage";
import type { AgentMode } from "../core/agent";
import type { PermissionMode } from "../config/types";
import { runRalph } from "../orchestration/ralph";
import { runShellCommand } from "../tools/bash-tool";
import { detectVerifyCommand } from "../tools/verify-tool";
import { readJson, truncateText } from "../util/fs";
import { VERSION } from "../version";
import type { Runtime } from "../runtime";
import type { Renderer } from "./render";
import { rendererCallbacks } from "./callbacks";
import { verifySkills, writeSkillsLock } from "../skills/loader";
import { installSkill } from "../skills/install";

export interface CommandContext {
  runtime: Runtime;
  renderer: Renderer;
  cwd: string;
  exit: () => void;
  restart: (options?: { sessionId?: string; newSession?: boolean }) => void;
  ask: (question: string) => Promise<string | null>;
}

const MODES: AgentMode[] = ["plan", "build", "compose", "review", "yolo"];
const PERMISSION_MODES: PermissionMode[] = ["ask", "auto", "full"];

const HELP = `Commands
  /help                      show this help
  /mode <plan|build|compose|review|yolo>
  /plan /build /review /yolo mode shortcuts
  /model [spec]              show or switch model (provider/model or alias)
  /models                    list aliases and provider credential status (Ctrl+S: scope, free models on top)
  /permissions [ask|auto|full]
  /status                    session, model, mode, cost
  /cost                      token usage and spend
  /compact                   compact in-memory conversation
  /clear                     clear the screen

Sessions
  /sessions                  list sessions
  /new [title]               start a fresh session
  /resume <id|latest>        resume a session
  /undo                      undo the last checkpoint
  /checkpoints               list checkpoints
  /rewind <id>               restore a checkpoint

Work
  /diff [git args]           show git diff
  /git [args]                run a git command
  /verify [command]          run tests/lint/typecheck/build
  /ralph <task> [--verify cmd] [--iterations N]
  /tasks                     show the task list
  /init                      create .xminal/config.json for this project
  /doctor                    environment diagnostics
  /report (or /issue)        open the GitHub issue tracker

Context
  /memory [list|add <text>|search <q>|forget <id>]
  /skills [--lock|--verify]  list skills; lock (trust) or verify the lockfile
  /skills install <path|git-url> [--global]   install a skill
  /skill <name>              print a skill
  /mcp                       list MCP servers + per-MCP token usage
  /tools                     per-tool token usage (calls / est. tokens / errors)
  /audit [verify|tail]       verify the hash-chained audit log
  /docs                      show docs/ROADMAP.md (what XMINAL is and where it is headed)
  /version                   version
  /exit                      quit`;

export async function handleCommand(input: string, ctx: CommandContext): Promise<boolean> {
  const line = input.trim();
  if (!line.startsWith("/")) return false;
  const body = line.slice(1).trim();
  if (!body) {
    ctx.renderer.warn("Type /help for commands.");
    return true;
  }
  const space = body.indexOf(" ");
  const command = (space === -1 ? body : body.slice(0, space)).toLowerCase();
  const rest = space === -1 ? "" : body.slice(space + 1).trim();
  const { runtime, renderer } = ctx;

  switch (command) {
    case "help":
    case "?":
      renderer.info(HELP);
      return true;

    case "exit":
    case "quit":
    case "q":
      ctx.exit();
      return true;

    case "version":
      renderer.info(`xminal ${VERSION}`);
      return true;

    case "mode": {
      if (!rest) {
        renderer.info(`mode: ${runtime.agent.mode}`);
        return true;
      }
      setMode(runtime, renderer, rest);
      return true;
    }

    case "plan":
    case "build":
    case "compose":
    case "review":
    case "yolo":
      setMode(runtime, renderer, command);
      return true;

    case "model": {
      if (!rest) {
        renderer.info(`model: ${runtime.agent.modelSpec}`);
        return true;
      }
      try {
        const resolved = resolveModel(runtime.config, rest);
        runtime.agent.setModel(rest);
        renderer.success(`model → ${resolved.alias} (${resolved.provider}/${resolved.model})`);
      } catch (error) {
        renderer.error((error as Error).message);
      }
      return true;
    }

    case "models": {
      const lines: string[] = [];
      for (const [name, provider] of Object.entries(runtime.config.providers)) {
        const ready = providerReady(provider) ? (provider.requiresKey === false ? "free" : "key") : "no key";
        lines.push(`  ${name.padEnd(12)} ${provider.type.padEnd(10)} ${ready}`);
      }
      const aliases = listModelAliases(runtime.config);
      renderer.info(`providers:\n${lines.join("\n")}`);
      renderer.info(`aliases: ${aliases.length} configured (showing 10): ${aliases.slice(0, 10).join(", ")}${aliases.length > 10 ? " …" : ""}\ndefault: ${runtime.config.defaultModel}`);
      return true;
    }

    case "permissions": {
      if (!rest) {
        renderer.info(`permissions: ${runtime.permissions.mode}`);
        return true;
      }
      if (!PERMISSION_MODES.includes(rest as PermissionMode)) {
        renderer.error(`Permission mode must be one of: ${PERMISSION_MODES.join(", ")}`);
        return true;
      }
      runtime.permissions.setMode(rest as PermissionMode);
      runtime.session.setMode(rest as PermissionMode);
      renderer.success(`permissions → ${rest}`);
      return true;
    }

    case "status":
      await printStatus(ctx);
      return true;

    case "cost": {
      const cost = runtime.agent.getCost();
      const usage = loadToolUsage(runtime.cwd);
      renderer.info(
        `turns ${cost.turns} · ${cost.inputTokens} in / ${cost.outputTokens} out tokens · $${cost.costUsd.toFixed(6)} (limit $${runtime.config.limits.maxCostPerSession}) · tool tokens ≈ ${formatTokens(usage.totalTokens)}`,
      );
      return true;
    }

    case "tools": {
      printToolUsage(ctx);
      return true;
    }

    case "compact": {
      const removed = runtime.agent.compactHistory();
      renderer.success(removed ? `compacted ${removed} message(s)` : "nothing to compact");
      return true;
    }

    case "clear":
      process.stdout.write("\x1b[2J\x1b[H");
      return true;

    case "sessions": {
      const sessions = runtime.sessionSummaries();
      if (sessions.length === 0) {
        renderer.info("(no sessions)");
        return true;
      }
      renderer.info(
        sessions
          .slice(0, 20)
          .map(
            (meta) =>
              `${meta.id === runtime.session.id ? "*" : " "} ${meta.id} · ${meta.updatedAt} · ${meta.model} · ${meta.messageCount} msg · ${meta.title}`,
          )
          .join("\n"),
      );
      return true;
    }

    case "resume": {
      const target = rest === "latest" || !rest ? runtime.sessionSummaries()[0]?.id : rest;
      if (!target) {
        renderer.warn("No session to resume.");
        return true;
      }
      try {
        ctx.restart({ sessionId: target });
        renderer.success(`resumed ${ctx.runtime.session.id} (${ctx.runtime.session.meta.title})`);
      } catch (error) {
        renderer.error((error as Error).message);
      }
      return true;
    }

    case "new":
      ctx.restart({ newSession: true });
      renderer.success(`new session ${ctx.runtime.session.id}`);
      return true;

    case "undo": {
      const undone = runtime.session.undoLast();
      if (!undone) renderer.warn("No checkpoints to undo.");
      else renderer.success(`undid ${undone.id} (${undone.restored} file(s) restored)`);
      return true;
    }

    case "checkpoints": {
      const checkpoints = runtime.session.listCheckpoints();
      renderer.info(
        checkpoints.length
          ? checkpoints
              .map((checkpoint) => `${checkpoint.id} · ${checkpoint.ts} · ${checkpoint.label} · ${checkpoint.files.length} file(s)`)
              .join("\n")
          : "(no checkpoints)",
      );
      return true;
    }

    case "rewind": {
      if (!rest) {
        renderer.warn("Usage: /rewind <checkpoint-id>");
        return true;
      }
      try {
        const restored = runtime.session.restoreCheckpoint(rest);
        renderer.success(`restored ${rest} (${restored} file(s))`);
      } catch (error) {
        renderer.error((error as Error).message);
      }
      return true;
    }

    case "diff": {
      const result = await runShellCommand(rest ? `git diff ${rest}` : "git diff --stat && git diff", {
        cwd: runtime.cwd,
        timeoutMs: 30_000,
      });
      const out = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      renderer.info(out ? truncateText(out, 20_000) : "(no changes)");
      return true;
    }

    case "git": {
      const result = await runShellCommand(`git ${rest || "status --short --branch"}`, {
        cwd: runtime.cwd,
        timeoutMs: 30_000,
      });
      renderer.info(truncateText([result.stdout, result.stderr].filter(Boolean).join("\n").trim() || "(no output)", 20_000));
      return true;
    }

    case "verify": {
      const verifyCommand = rest || runtime.config.verifyCommand || detectVerifyCommand(runtime.cwd);
      if (!verifyCommand) {
        renderer.warn("No verification command detected. Pass one: /verify <command>");
        return true;
      }
      renderer.status(`verifying: ${verifyCommand}`);
      const result = await runShellCommand(verifyCommand, {
        cwd: runtime.cwd,
        timeoutMs: 300_000,
        sandbox: runtime.config.sandbox,
      });
      const body = [result.stdout, result.stderr].filter(Boolean).join("\n");
      const passed = result.exitCode === 0 && !result.timedOut;
      if (passed) renderer.success(`PASS: ${verifyCommand} (${result.durationMs}ms)`);
      else renderer.error(`FAIL: ${verifyCommand} (exit ${result.exitCode ?? "?"})`);
      if (body) renderer.info(truncateText(body, 12_000));
      return true;
    }

    case "ralph": {
      if (!rest) {
        renderer.warn("Usage: /ralph <task> [--verify \"command\"] [--iterations N]");
        return true;
      }
      const parsed = parseRalphArgs(rest);
      if (!parsed.task) {
        renderer.warn("Ralph needs a task description.");
        return true;
      }
      try {
        const result = await runRalph(runtime, {
          task: parsed.task,
          verifyCommand: parsed.verify,
          maxIterations: parsed.iterations,
          callbacks: rendererCallbacks(renderer),
        });
        renderer.flush();
        if (result.passed) {
          renderer.success(`Ralph passed in ${result.iterations} iteration(s) using: ${result.command}`);
        } else {
          renderer.error(`Ralph failed after ${result.iterations} iteration(s): ${result.command}`);
        }
      } catch (error) {
        renderer.error((error as Error).message);
      }
      return true;
    }

    case "tasks": {
      const todos = readJson<Array<{ id: string; text: string; status: string; priority: string }>>(
        projectTodosPath(runtime.cwd),
        [],
      );
      renderer.info(
        todos.length
          ? todos.map((todo) => `${todo.status === "completed" ? "[x]" : todo.status === "in_progress" ? "[~]" : "[ ]"} ${todo.id} · ${todo.text} [${todo.priority}]`).join("\n")
          : "(no tasks)",
      );
      return true;
    }

    case "init": {
      const { configPath } = initProject(runtime.cwd);
      ensureGitignore(runtime.cwd);
      renderer.success(`project initialized: ${configPath}`);
      return true;
    }

    case "doctor": {
      const checks = runDoctor(runtime.cwd, runtime.loaded);
      renderer.info(formatDoctor(checks));
      return true;
    }

    case "memory": {
      if (!rest || rest === "list") {
        const entries = runtime.memory.list().slice(0, 20);
        renderer.info(
          entries.length
            ? entries.map((entry) => `${entry.id} · ${entry.scope} · ${entry.ts.slice(0, 10)} · ${entry.text}`).join("\n")
            : "(no memory entries)",
        );
        return true;
      }
      if (rest.startsWith("add ")) {
        const text = rest.slice(4).trim();
        if (!text) {
          renderer.warn("Usage: /memory add <text>");
          return true;
        }
        const entry = runtime.memory.add(text, ["cli"], "project");
        renderer.success(`remembered ${entry.id}`);
        return true;
      }
      if (rest.startsWith("search ")) {
        const query = rest.slice(7).trim();
        const results = runtime.memory.search(query);
        renderer.info(
          results.length
            ? results.map((entry) => `${entry.id} · score ${entry.score} · ${entry.text}`).join("\n")
            : "(no matches)",
        );
        return true;
      }
      if (rest.startsWith("forget ")) {
        const id = rest.slice(7).trim();
        renderer.info(runtime.memory.forget(id) ? `forgot ${id}` : `not found: ${id}`);
        return true;
      }
      renderer.warn("Usage: /memory [list|add <text>|search <q>|forget <id>]");
      return true;
    }

    case "skills": {
      if (rest.startsWith("install ")) {
        const target = rest.slice("install ".length).trim();
        const isGlobal = target.endsWith(" --global");
        try {
          const result = installSkill(runtime.cwd, isGlobal ? target.slice(0, -" --global".length).trim() : target, { global: isGlobal });
          renderer.success(`installed skill ${result.name}`);
        } catch (error) {
          renderer.error((error as Error).message);
        }
        return true;
      }
      if (rest === "--lock") {
        const count = writeSkillsLock(runtime.cwd);
        renderer.success(`skills lock written: ${count} skill(s)`);
        return true;
      }
      if (rest === "--verify") {
        const verification = verifySkills(runtime.cwd);
        if (verification.ok) {
          renderer.success(`skills lock OK · ${verification.total} skill(s) trusted`);
        } else {
          renderer.warn(`skills lock drift: +${verification.added.length} ~${verification.changed.length} -${verification.removed.length} (run /skills --lock to trust)`);
        }
        return true;
      }
      const skills = runtime.skills.list();
      const verification = verifySkills(runtime.cwd);
      renderer.info(
        skills.length
          ? skills.map((skill) => `${skill.name} (${skill.source}) · ${skill.description.slice(0, 140)}`).join("\n")
          : "(no skills installed)",
      );
      if (!verification.ok) {
        renderer.warn(`skills lock drift: +${verification.added.length} added · ${verification.changed.length} changed · ${verification.removed.length} removed → /skills --lock`);
      }
      return true;
    }

    case "skill": {
      if (!rest) {
        renderer.warn("Usage: /skill <name>");
        return true;
      }
      try {
        renderer.info(truncateText(runtime.skills.load(rest), 20_000));
      } catch (error) {
        renderer.error((error as Error).message);
      }
      return true;
    }

    case "audit": {
      const action = rest.split(/\s+/)[0] ?? "verify";
      if (action === "verify" || !action) {
        const result = verifyAudit(runtime.cwd);
        renderer.info(
          result.valid
            ? `audit chain valid · ${result.entries} entries`
            : `audit chain BROKEN at seq ${result.firstBrokenSeq ?? "?"}: ${result.reason ?? "unknown"}`,
        );
        return true;
      }
      if (action === "tail") {
        for (const entry of tailAudit(runtime.cwd, 10)) {
          renderer.info(`${entry.seq} · ${String(entry.ts ?? "").slice(0, 19)} · ${entry.action} · ${entry.decision}`);
        }
        return true;
      }
      renderer.warn("Usage: /audit [verify|tail]");
      return true;
    }

    case "mcp": {
      // catalogue mode: `xminal mcp search <query> [--platform mobile]`
      const parts = rest.trim().split(/\s+/).filter(Boolean);
      if (parts[0] === "search" || parts[0] === "catalog" || parts[0] === "find") {
        const platformFlag = parts.findIndex((p) => p === "--platform" || p === "-p");
        const platform = platformFlag >= 0 ? parts[platformFlag + 1] : undefined;
        const query = parts
          .slice(1)
          .filter((_, i) => !(platformFlag >= 0 && (i === platformFlag - 1 || i === platformFlag)))
          .join(" ");
        const hits = searchMcpServers(query, { platform, limit: 40 });
        const catalog = loadMcpCatalog();
        if (!catalog) {
          renderer.warn("MCP catalog not found — run scripts/fetch-mcp-catalog.py to build data/mcp-catalog.json");
          return true;
        }
        renderer.info(
          `MCP catalog: ${catalog.count} servers (${catalog.source}) — showing ${hits.length} for "${query || "*"}"${platform ? ` · platform ${platform}` : ""}`,
        );
        for (const entry of hits) {
          renderer.status(`${entry.name}  ·  ${entry.work}`);
          renderer.info(`   ${entry.id}  ·  ${entry.platforms.join("/").toUpperCase()}${entry.remote ? " · HOSTED" : ""}  ·  ${entry.url}`);
        }
        if (hits.length === 0) renderer.info("(no matches)");
        return true;
      }
      const servers = runtime.mcp.listServerNames();
      if (servers.length === 0) {
        renderer.info("(no MCP servers configured — add mcpServers to ~/.xminal/config.json)");
      } else {
        renderer.status(`querying ${servers.length} MCP server(s)…`);
        try {
          const tools = await Promise.race([
            runtime.mcp.listAllTools(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("MCP listing timed out")), 10_000)),
          ]);
          renderer.info(
            tools.length
              ? tools.map(({ server, tool }) => `${server}/${tool.name} · ${tool.description ?? ""}`).join("\n")
              : `servers: ${servers.join(", ")} (no tools reported)`,
          );
        } catch (error) {
          renderer.warn((error as Error).message);
        }
      }
      printToolUsage(ctx);
      return true;
    }

    case "docs": {
      const file = path.join(runtime.cwd, "docs", "ROADMAP.md");
      if (fs.existsSync(file)) {
        renderer.info(truncateText(fs.readFileSync(file, "utf8"), 20_000));
        return true;
      }
      renderer.info("no docs/ROADMAP.md in this directory — see https://github.com/quitsaurabhverma2008-sketch/xminal/blob/main/docs/ROADMAP.md");
      return true;
    }

    case "report":
    case "issue": {
      const url = "https://github.com/quitsaurabhverma2008-sketch/xminal/issues/new";
      const opened = openExternal(url);
      renderer.info(opened ? `opened: ${url}` : `Report bugs here: ${url}`);
      return true;
    }

    default:
      renderer.warn(`Unknown command: /${command}. Type /help.`);
      return true;
  }
}

function printToolUsage(ctx: CommandContext): void {
  const summary = loadToolUsage(ctx.cwd);
  if (summary.byTool.length === 0) {
    ctx.renderer.info("tool usage · (no calls recorded yet — use the agent, then /tools)");
    return;
  }
  const lines = summary.byTool
    .slice(0, 50)
    .map((bucket) => {
      const name = bucket.name.padEnd(38).slice(0, 38);
      const calls = String(bucket.calls).padStart(5);
      const tokens = formatTokens(bucket.tokens).padStart(7);
      const errors = bucket.errors > 0 ? `${bucket.errors} err` : "-";
      return `${name} ${calls}  ${tokens} tok  ${errors}`;
    })
    .join("\n");
  ctx.renderer.info(
    `tool usage (all-time, this project — ≈ tokens from chars/4):\n${lines}\ntotal: ${summary.totalCalls} calls · ${formatTokens(summary.totalTokens)} tokens · ${summary.totalErrors} errors`,
  );
}

function setMode(runtime: Runtime, renderer: Renderer, mode: string): void {
  if (!MODES.includes(mode as AgentMode)) {
    renderer.error(`Mode must be one of: ${MODES.join(", ")}`);
    return;
  }
  runtime.setMode(mode as AgentMode);
  if (mode === "yolo") runtime.session.setMode("full");
  renderer.success(`mode → ${mode}`);
}

async function printStatus(ctx: CommandContext): Promise<void> {
  const { runtime, renderer } = ctx;
  const cost = runtime.agent.getCost();
  let model = runtime.agent.modelSpec;
  try {
    const resolved = resolveModel(runtime.config, runtime.agent.modelSpec);
    model = `${resolved.alias} (${resolved.provider}/${resolved.model})`;
  } catch {
    model += " (unresolved)";
  }
  renderer.info(
    [
      `session     ${runtime.session.id} · ${runtime.session.meta.title}`,
      `cwd         ${runtime.cwd}`,
      `model       ${model}`,
      `mode        ${runtime.agent.mode}`,
      `permission  ${runtime.permissions.mode}`,
      `turns       ${cost.turns}`,
      `tokens      ${cost.inputTokens} in / ${cost.outputTokens} out`,
      `cost        $${cost.costUsd.toFixed(6)}`,
      `tools       ${runtime.tools.names().length}`,
      `skills      ${runtime.skills.list().length}`,
      `mcp         ${runtime.mcp.listServerNames().length} server(s)`,
    ].join("\n"),
  );
}

function parseRalphArgs(input: string): { task: string; verify?: string; iterations?: number } {
  let task = input;
  let verify: string | undefined;
  let iterations: number | undefined;

  const verifyMatch = task.match(/--verify(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (verifyMatch) {
    verify = verifyMatch[1] ?? verifyMatch[2] ?? verifyMatch[3];
    task = task.replace(verifyMatch[0], " ");
  }
  const iterationsMatch = task.match(/--iterations(?:=|\s+)(\d+)/);
  if (iterationsMatch) {
    iterations = Number(iterationsMatch[1]);
    task = task.replace(iterationsMatch[0], " ");
  }
  return { task: task.replace(/\s+/g, " ").trim(), verify, iterations };
}

function openExternal(url: string): boolean {
  const platform = process.platform;
  const candidates: Array<[string, string[]]> =
    platform === "darwin"
      ? [["open", [url]]]
      : platform === "win32"
        ? [["cmd", ["/c", "start", "", url]]]
        : [
            ["termux-open-url", [url]],
            ["xdg-open", [url]],
            ["gio", ["open", url]],
          ];
  for (const [bin, args] of candidates) {
    try {
      const result = spawnSync(bin, args, { stdio: "ignore" });
      if (result.status === 0) return true;
    } catch {
      // try next candidate
    }
  }
  return false;
}

function ensureGitignore(cwd: string): void {
  const file = path.join(cwd, ".gitignore");
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (current.split(/\r?\n/).some((line) => line.trim() === ".xminal/" || line.trim() === ".xminal")) return;
  const next = current.endsWith("\n") || current === "" ? current : current + "\n";
  fs.writeFileSync(file, `${next}.xminal/\n`);
}
