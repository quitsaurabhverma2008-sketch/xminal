import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { exists, ensureDir } from "../util/fs";
import { projectSkillsDir } from "../config/paths";
import os from "node:os";

export interface SkillInstallResult {
  name: string;
  destination: string;
  source: "folder" | "git";
}

const GIT_URL = /^(https?:\/\/|git@|ssh:\/\/).+|^.*\.git$/i;

export function installSkill(cwd: string, target: string, options: { global?: boolean } = {}): SkillInstallResult {
  const skillsRoot = options.global ? path.join(os.homedir(), ".xminal", "skills") : projectSkillsDir(cwd);
  ensureDir(skillsRoot);

  if (exists(target)) {
    const source = fs.statSync(target).isDirectory() ? target : path.dirname(target);
    const skillFile = path.join(source, "SKILL.md");
    if (!exists(skillFile)) {
      throw new Error(`No SKILL.md found in ${source}. A skill folder must contain SKILL.md.`);
    }
    const name = path.basename(source);
    const destination = path.join(skillsRoot, name);
    fs.rmSync(destination, { recursive: true, force: true });
    fs.cpSync(source, destination, { recursive: true });
    return { name, destination, source: "folder" };
  }

  if (!GIT_URL.test(target)) {
    throw new Error(`Skill path not found: ${target} (provide a local folder or a git URL).`);
  }

  const base = target.split("/").pop()?.replace(/\.git$/, "") ?? "skill";
  const name = base.replace(/[^A-Za-z0-9._-]+/g, "-");
  const destination = path.join(skillsRoot, name);
  fs.rmSync(destination, { recursive: true, force: true });

  const result = spawnSync("git", ["clone", "--depth", "1", "--", target, destination], {
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.status !== 0) {
    fs.rmSync(destination, { recursive: true, force: true });
    throw new Error(`git clone failed (${result.status ?? "timeout"}): ${(result.stderr || result.stdout || "").trim()}`);
  }
  if (!exists(path.join(destination, "SKILL.md"))) {
    fs.rmSync(destination, { recursive: true, force: true });
    throw new Error(`Cloned ${target} but found no SKILL.md at its root.`);
  }
  return { name, destination, source: "git" };
}

