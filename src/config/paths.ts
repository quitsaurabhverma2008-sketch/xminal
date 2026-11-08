import os from "node:os";
import path from "node:path";

export function globalXminalDir(): string {
  return path.join(os.homedir(), ".xminal");
}

export function globalConfigPath(): string {
  return path.join(globalXminalDir(), "config.json");
}

export function globalMemoryDir(): string {
  return path.join(globalXminalDir(), "memory");
}

export function projectXminalDir(cwd: string): string {
  return path.join(cwd, ".xminal");
}

export function projectConfigPath(cwd: string): string {
  return path.join(projectXminalDir(cwd), "config.json");
}

export function projectSessionsDir(cwd: string): string {
  return path.join(projectXminalDir(cwd), "sessions");
}

export function projectMemoryDir(cwd: string): string {
  return path.join(projectXminalDir(cwd), "memory");
}

export function projectCheckpointsDir(cwd: string): string {
  return path.join(projectXminalDir(cwd), "checkpoints");
}

export function projectReceiptsDir(cwd: string): string {
  return path.join(projectXminalDir(cwd), "receipts");
}

export function projectTodosPath(cwd: string): string {
  return path.join(projectXminalDir(cwd), "todos.json");
}

export function projectSkillsDir(cwd: string): string {
  return path.join(projectXminalDir(cwd), "skills");
}
