"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryTools = void 0;
const types_1 = require("./types");
const memoryTool = {
    name: "memory",
    description: "Persistent memory across sessions. Actions: add (text, tags, global), search (query), list, forget (id). Use for durable preferences, decisions, and lessons.",
    readOnly: true,
    parameters: {
        type: "object",
        properties: {
            action: { type: "string", enum: ["add", "search", "list", "forget"], description: "Action." },
            text: { type: "string", description: "Memory text (add)." },
            query: { type: "string", description: "Search query (search)." },
            tags: { type: "array", items: { type: "string" }, description: "Tags (add)." },
            id: { type: "string", description: "Memory id (forget)." },
            global: { type: "boolean", description: "Write to global memory instead of project memory." },
        },
        required: ["action"],
    },
    async run(args, context) {
        const action = (0, types_1.stringArg)(args, "action", "list");
        if (action === "add") {
            const text = (0, types_1.stringArg)(args, "text").trim();
            if (!text)
                return (0, types_1.errorResult)("text is required for add.");
            const tags = Array.isArray(args.tags) ? args.tags.map(String) : [];
            const scope = (0, types_1.booleanArg)(args, "global", false) ? "global" : "project";
            const entry = context.memory.add(text, tags, scope);
            return (0, types_1.textResult)(`Saved memory ${entry.id} (${scope}).`);
        }
        if (action === "search") {
            const query = (0, types_1.stringArg)(args, "query");
            if (!query)
                return (0, types_1.errorResult)("query is required for search.");
            const results = context.memory.search(query, 10);
            if (results.length === 0)
                return (0, types_1.textResult)(`No memories found for "${query}".`);
            return (0, types_1.textResult)(results.map((entry) => `${entry.id} · ${entry.ts.slice(0, 10)} · ${entry.scope} · score ${entry.score}\n  ${entry.text}`).join("\n"));
        }
        if (action === "forget") {
            const id = (0, types_1.stringArg)(args, "id");
            if (!id)
                return (0, types_1.errorResult)("id is required for forget.");
            return (0, types_1.textResult)(context.memory.forget(id) ? `Forgot ${id}.` : `Memory not found: ${id}`);
        }
        const entries = context.memory.list();
        return (0, types_1.textResult)(entries.length
            ? entries.map((entry) => `${entry.id} · ${entry.ts.slice(0, 10)} · ${entry.scope} · ${entry.text}`).join("\n")
            : "(no memories)");
    },
};
exports.memoryTools = [memoryTool];
//# sourceMappingURL=memory-tool.js.map