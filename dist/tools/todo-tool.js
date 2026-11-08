"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.todoTools = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const types_1 = require("./types");
const paths_1 = require("../config/paths");
const fs_1 = require("../util/fs");
const node_path_1 = __importDefault(require("node:path"));
const STATUS_MARK = {
    pending: "[ ]",
    in_progress: "[~]",
    completed: "[x]",
    blocked: "[!]",
};
function loadTodos(cwd) {
    return (0, fs_1.readJson)((0, paths_1.projectTodosPath)(cwd), []);
}
function saveTodos(cwd, todos) {
    (0, fs_1.ensureDir)(node_path_1.default.dirname((0, paths_1.projectTodosPath)(cwd)));
    (0, fs_1.writeJson)((0, paths_1.projectTodosPath)(cwd), todos);
}
function formatTodos(todos) {
    if (todos.length === 0)
        return "(no tasks)";
    return todos
        .map((todo) => `${STATUS_MARK[todo.status]} ${todo.id} · ${todo.text} [${todo.priority}]`)
        .join("\n");
}
const todoTool = {
    name: "todo",
    description: "Manage the project task list stored in .xminal/todos.json. Actions: list, add, update, remove, clear.",
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
        const action = (0, types_1.stringArg)(args, "action", "list");
        const todos = loadTodos(context.cwd);
        if (action === "list")
            return (0, types_1.textResult)(formatTodos(todos));
        if (action === "add") {
            const text = (0, types_1.stringArg)(args, "text").trim();
            if (!text)
                return (0, types_1.errorResult)("text is required for add.");
            const now = new Date().toISOString();
            const todo = {
                id: node_crypto_1.default.randomBytes(3).toString("hex"),
                text,
                status: "pending",
                priority: (0, types_1.stringArg)(args, "priority", "medium") || "medium",
                createdAt: now,
                updatedAt: now,
            };
            todos.push(todo);
            saveTodos(context.cwd, todos);
            return (0, types_1.textResult)(`Added ${todo.id}: ${todo.text}\n${formatTodos(todos)}`);
        }
        if (action === "update") {
            const id = (0, types_1.stringArg)(args, "id");
            const todo = todos.find((item) => item.id === id);
            if (!todo)
                return (0, types_1.errorResult)(`Task not found: ${id}`);
            if (args.text)
                todo.text = (0, types_1.stringArg)(args, "text");
            if (args.status)
                todo.status = (0, types_1.stringArg)(args, "status");
            if (args.priority)
                todo.priority = (0, types_1.stringArg)(args, "priority");
            todo.updatedAt = new Date().toISOString();
            saveTodos(context.cwd, todos);
            return (0, types_1.textResult)(`Updated ${todo.id}\n${formatTodos(todos)}`);
        }
        if (action === "remove") {
            const id = (0, types_1.stringArg)(args, "id");
            const next = todos.filter((item) => item.id !== id);
            if (next.length === todos.length)
                return (0, types_1.errorResult)(`Task not found: ${id}`);
            saveTodos(context.cwd, next);
            return (0, types_1.textResult)(`Removed ${id}\n${formatTodos(next)}`);
        }
        if (action === "clear") {
            saveTodos(context.cwd, []);
            return (0, types_1.textResult)("Cleared all tasks.");
        }
        return (0, types_1.errorResult)(`Unknown action: ${action}`);
    },
};
exports.todoTools = [todoTool];
//# sourceMappingURL=todo-tool.js.map