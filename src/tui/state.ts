import path from "node:path";
import fs from "node:fs";
import { projectTodosPath } from "../config/paths";
import { readJson } from "../util/fs";

export interface TodoItem {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  priority: "low" | "medium" | "high";
}

export interface SidebarContext {
  cwd: string;
  gitBranch?: string;
  sessionId: string;
  sessionTitle: string;
  model: string;
  mode: string;
  costUsd: number;
  turns: number;
  todos: TodoItem[];
  mcpServers: string[];
  mcpToolCounts: Array<{ server: string; tools: number }>;
  skillCount: number;
}

export function loadTodos(cwd: string): TodoItem[] {
  try {
    const items = readJson<TodoItem[]>(projectTodosPath(cwd), []);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function detectGitBranch(cwd: string): string | undefined {
  try {
    const head = path.join(cwd, ".git", "HEAD");
    if (!fs.existsSync(head)) return undefined;
    const content = fs.readFileSync(head, "utf8").trim();
    const match = content.match(/^ref:\s*refs\/heads\/(.+)$/);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}
