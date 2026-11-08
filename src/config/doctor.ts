import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import type { LoadedConfig } from "./config";
import { listModelAliases, providerReady } from "./config";
import { exists } from "../util/fs";
import { globalXminalDir, projectXminalDir, projectSessionsDir } from "./paths";

export interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

export function runDoctor(cwd: string, loaded: LoadedConfig): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const nodeMajor = Number(process.version.replace(/^v/, "").split(".")[0]);
  checks.push({
    name: "Node.js",
    status: nodeMajor >= 18 ? "ok" : "fail",
    detail: `${process.version}${nodeMajor >= 18 ? "" : " (need >= 18)"}`,
  });
  checks.push({
    name: "Platform",
    status: "ok",
    detail: `${os.platform()} ${os.arch()} · ${os.homedir()}`,
  });
  checks.push({
    name: "Global config",
    status: exists(loaded.globalPath) ? "ok" : "warn",
    detail: exists(loaded.globalPath) ? loaded.globalPath : `${loaded.globalPath} missing (using defaults)`,
  });
  checks.push({
    name: "Project config",
    status: loaded.projectExists ? "ok" : "warn",
    detail: loaded.projectExists ? loaded.projectPath : `${loaded.projectPath} missing (run: xminal init)`,
  });

  const providers = Object.entries(loaded.config.providers);
  const ready = providers.filter(([, provider]) => providerReady(provider));
  checks.push({
    name: "Providers",
    status: ready.length > 0 ? "ok" : "fail",
    detail:
      ready.length > 0
        ? ready.map(([name]) => name).join(", ")
        : "no credentials. Set OPENROUTER_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY or configure ~/.xminal/config.json",
  });

  const aliases = listModelAliases(loaded.config);
  const head = aliases.slice(0, 6).join(", ");
  checks.push({
    name: "Model aliases",
    status: "ok",
    detail: `${aliases.length} configured · ${head}${aliases.length > 6 ? ` … (+${aliases.length - 6} more)` : ""} · default ${loaded.config.defaultModel}`,
  });

  for (const dir of [globalXminalDir(), projectXminalDir(cwd), projectSessionsDir(cwd)]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      checks.push({ name: "Writable", status: "ok", detail: dir });
    } catch (error) {
      checks.push({ name: "Writable", status: "fail", detail: `${dir}: ${(error as Error).message}` });
    }
  }

  const git = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, encoding: "utf8" });
  checks.push({
    name: "Git",
    status: git.status === 0 ? "ok" : "warn",
    detail: git.status === 0 ? "inside a git work tree" : "not a git repository (worktrees/undo-diff limited)",
  });

  const bwrap = spawnSync("sh", ["-c", "command -v bwrap"], { encoding: "utf8" });
  checks.push({
    name: "Sandbox",
    status: bwrap.status === 0 ? "ok" : "warn",
    detail: bwrap.status === 0 ? "bubblewrap available" : "bwrap not found (sandbox backend unavailable)",
  });

  const skills = fs.existsSync(path.join(os.homedir(), ".agents", "skills"))
    ? fs.readdirSync(path.join(os.homedir(), ".agents", "skills")).filter((name) =>
        fs.existsSync(path.join(os.homedir(), ".agents", "skills", name, "SKILL.md")),
      ).length
    : 0;
  checks.push({
    name: "Skills",
    status: skills > 0 ? "ok" : "warn",
    detail: `${skills} skill(s) in ~/.agents/skills`,
  });

  const mcpCount = Object.keys(loaded.config.mcpServers).length;
  checks.push({
    name: "MCP",
    status: mcpCount > 0 ? "ok" : "warn",
    detail: mcpCount > 0 ? `${mcpCount} server(s) configured` : "no MCP servers configured",
  });

  return checks;
}

export function formatDoctor(checks: DoctorCheck[]): string {
  return checks
    .map((check) => {
      const icon = check.status === "ok" ? "✓" : check.status === "warn" ? "!" : "✗";
      return `${icon} ${check.name}: ${check.detail}`;
    })
    .join("\n");
}
