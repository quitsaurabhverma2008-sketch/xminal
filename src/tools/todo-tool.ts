import fs from "node:fs";
import crypto from "node:crypto";
import type { Tool } from "./types";
import { errorResult, stringArg, textResult } from "./types";
import { projectTodosPath } from "../config/paths";
import { ensureDir, exists, readJson, writeJson } from "../util/fs";
import path from "node:path";

interface TodoItem {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  priority: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
}

const STATUS_MARK: Record<TodoItem["status"], string> = {
  pending: "[ ]",
  in_progress: "[~]",
  completed: "[x]",
  blocked: "[!]",
};

function loadTodos(cwd: string): TodoItem[] {
  return readJson<TodoItem[]>(projectTodosPath(cwd), []);
}

function saveTodos(cwd: string, todos: TodoItem[]): void {
  ensureDir(path.dirname(projectTodosPath(cwd)));
  writeJson(projectTodosPath(cwd), todos);
}

function formatTodos(todos: TodoItem[]): string {
  if (todos.length === 0) return "(no tasks)";
  return todos
    .map((todo) => `${STATUS_MARK[todo.status]} ${todo.id} · ${todo.text} [${todo.priority}]`)
    .join("\n");
}

const todoTool: Tool = {
  name: "todo",
  description:
    "Manage the project task list stored in .xminal/todos.json. Actions: list, add, update, remove, clear.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["list", "add", "update", "remove", "clear"], description: "Action." },
      text: { type: "string", description: "Task text (add/update)." },
      id: { type: "string", description: "Task id (update/remove)." },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed", "blocked"],
        description: "Task status.",
      },
      priority: { type: "string", enum: ["low", "medium", "high"], description: "Task priority." },
    },
    required: ["action"],
  },
  async run(args, context) {
    const action = stringArg(args, "action", "list");
    const todos = loadTodos(context.cwd);
    if (action === "list") return textResult(formatTodos(todos));
    if (action === "add") {
      const text = stringArg(args, "text").trim();
      if (!text) return errorResult("text is required for add.");
      const now = new Date().toISOString();
      const todo: TodoItem = {
        id: crypto.randomBytes(3).toString("hex"),
        text,
        status: "pending",
        priority: (stringArg(args, "priority", "medium") as TodoItem["priority"]) || "medium",
        createdAt: now,
        updatedAt: now,
      };
      todos.push(todo);
      saveTodos(context.cwd, todos);
      return textResult(`Added ${todo.id}: ${todo.text}\n${formatTodos(todos)}`);
    }
    if (action === "update") {
      const id = stringArg(args, "id");
      const todo = todos.find((item) => item.id === id);
      if (!todo) return errorResult(`Task not found: ${id}`);
      if (args.text) todo.text = stringArg(args, "text");
      if (args.status) todo.status = stringArg(args, "status") as TodoItem["status"];
      if (args.priority) todo.priority = stringArg(args, "priority") as TodoItem["priority"];
      todo.updatedAt = new Date().toISOString();
      saveTodos(context.cwd, todos);
      return textResult(`Updated ${todo.id}\n${formatTodos(todos)}`);
    }
    if (action === "remove") {
      const id = stringArg(args, "id");
      const next = todos.filter((item) => item.id !== id);
      if (next.length === todos.length) return errorResult(`Task not found: ${id}`);
      saveTodos(context.cwd, next);
      return textResult(`Removed ${id}\n${formatTodos(next)}`);
    }
    if (action === "clear") {
      saveTodos(context.cwd, []);
      return textResult("Cleared all tasks.");
    }
    return errorResult(`Unknown action: ${action}`);
  },
};

export const todoTools: Tool[] = [todoTool];
