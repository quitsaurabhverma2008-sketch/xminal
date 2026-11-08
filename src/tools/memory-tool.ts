import type { Tool } from "./types";
import { booleanArg, errorResult, stringArg, textResult } from "./types";

const memoryTool: Tool = {
  name: "memory",
  description:
    "Persistent memory across sessions. Actions: add (text, tags, global), search (query), list, forget (id). Use for durable preferences, decisions, and lessons.",
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
    const action = stringArg(args, "action", "list");
    if (action === "add") {
      const text = stringArg(args, "text").trim();
      if (!text) return errorResult("text is required for add.");
      const tags = Array.isArray(args.tags) ? (args.tags as unknown[]).map(String) : [];
      const scope = booleanArg(args, "global", false) ? "global" : "project";
      const entry = context.memory.add(text, tags, scope);
      return textResult(`Saved memory ${entry.id} (${scope}).`);
    }
    if (action === "search") {
      const query = stringArg(args, "query");
      if (!query) return errorResult("query is required for search.");
      const results = context.memory.search(query, 10);
      if (results.length === 0) return textResult(`No memories found for "${query}".`);
      return textResult(
        results.map((entry) => `${entry.id} · ${entry.ts.slice(0, 10)} · ${entry.scope} · score ${entry.score}\n  ${entry.text}`).join("\n"),
      );
    }
    if (action === "forget") {
      const id = stringArg(args, "id");
      if (!id) return errorResult("id is required for forget.");
      return textResult(context.memory.forget(id) ? `Forgot ${id}.` : `Memory not found: ${id}`);
    }
    const entries = context.memory.list();
    return textResult(
      entries.length
        ? entries.map((entry) => `${entry.id} · ${entry.ts.slice(0, 10)} · ${entry.scope} · ${entry.text}`).join("\n")
        : "(no memories)",
    );
  },
};

export const memoryTools: Tool[] = [memoryTool];
