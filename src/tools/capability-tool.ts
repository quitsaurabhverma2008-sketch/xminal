import fs from "node:fs";
import path from "node:path";
import type { Tool, ToolResult } from "./types";
import { errorResult, stringArg, textResult } from "./types";
import { allTools } from "./index";
import { searchMcpServers, mcpServerConfig, loadMcpCatalog, platformTags } from "../mcp/catalog";
import { renderToolList, renderMcpStatus } from "../core/capabilities";
import { globalConfigPath } from "../config/paths";
import { exists, readJson, writeJson } from "../util/fs";

/**
 * capabilities — the model asks "what can I reach?" and gets the truth:
 * tools with read-only markers, per-MCP status (including the ones that fail
 * to start), and the skills ranked for the current task. Read-only.
 */
const capabilitiesTool: Tool = {
  name: "capabilities",
  description:
    "List everything you can reach right now: built-in tools (with read-only markers), configured MCP servers and their real status (a dead server says so instead of vanishing), and the skills relevant to this task. Call this before claiming you cannot do something.",
  readOnly: true,
  parameters: { type: "object", properties: {} },
  async run(_args, context) {
    const tools = allTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      readOnly: Boolean(tool.readOnly),
    }));
    let mcpBlock = "MCP servers: none configured.";
    try {
      const statuses = await context.mcp.status();
      mcpBlock = renderMcpStatus(statuses);
    } catch (error) {
      mcpBlock = `MCP status unavailable: ${(error as Error)?.message ?? String(error)}`;
    }
    const skillList = context.skills.relevant("", 10).map((s) => s.name);
    const skillBlock = skillList.length
      ? `Relevant skills (use the skill tool to load one): ${skillList.join(", ")}`
      : "Skills: none loaded for this task.";
    return textResult(
      [
        "Tools:",
        renderToolList(tools),
        "",
        mcpBlock,
        "",
        skillBlock,
      ].join("\n"),
    );
  },
};

/** mcp_search — search the offline catalog of public MCP servers. Read-only. */
const mcpSearchTool: Tool = {
  name: "mcp_search",
  description:
    "Search the built-in (offline) catalog of public MCP servers by name or purpose, e.g. 'github', 'filesystem', 'database'. Returns name, what it does, docs URL, platforms, popularity and whether it is hosted. Read-only — it never installs anything.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search terms (name or what the server does). Empty lists the most popular." },
      limit: { type: "number", description: "Max results (default 8, max 25)." },
      platform: { type: "string", description: "Restrict to: linux | windows | mobile" },
    },
    required: ["query"],
  },
  async run(args) {
    const catalog = loadMcpCatalog();
    if (!catalog) return errorResult("The offline MCP catalog is missing from this build (data/mcp-catalog.json).");
    const query = stringArg(args, "query");
    const limit = Math.min(25, Math.max(1, Number(args.limit) || 8));
    const platform = typeof args.platform === "string" ? args.platform : undefined;
    const hits = searchMcpServers(query, { limit, platform });
    if (hits.length === 0) {
      return textResult(`No MCP servers match "${query}"${platform ? ` on ${platform}` : ""} (catalog: ${catalog.count} servers).`);
    }
    const lines = hits.map((hit) => {
      const hosted = hit.remote ? "hosted" : "self-hosted";
      return `- ${hit.name} (${hit.id}) — ${hit.work}\n  docs: ${hit.url}\n  ${platformTags(hit)} · ${hosted} · ~${hit.uses.toLocaleString("en-US")} users`;
    });
    return textResult(`MCP catalog (${catalog.count} servers) — matches for "${query}":\n${lines.join("\n")}\n\nUse mcp_add to register one (it stays disabled until you fill in the command from the docs).`);
  },
};

/**
 * mcp_add — register an MCP server from the catalog in the global config.
 * The catalog is a directory: it knows the server and docs, not the start
 * command, so the entry is written DISABLED with a visible placeholder.
 * It is NOT read-only — it writes your config, so it goes through the
 * normal permission flow.
 */
const mcpAddTool: Tool = {
  name: "mcp_add",
  description:
    "Add an MCP server to ~/.xminal/config.json mcpServers (disabled until you fill in the start command from its docs). Configured servers are available to the agent after a restart. The catalog entry is disabled by default — never enable a server just because you found it.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Catalog entry id from mcp_search, e.g. 'brave/search'" },
    },
    required: ["id"],
  },
  async run(args) {
    const catalog = loadMcpCatalog();
    if (!catalog) return errorResult("The offline MCP catalog is missing from this build.");
    const id = stringArg(args, "id");
    const entry = catalog.servers.find((candidate) => candidate.id === id);
    if (!entry) return errorResult(`No catalog entry with id "${id}". Call mcp_search first.`);
    const file = globalConfigPath();
    try {
      const raw = exists(file) ? readJson<Record<string, unknown>>(file, {}) : {};
      const servers = { ...((raw.mcpServers as Record<string, unknown>) ?? {}) };
      const name = entry.id.replace(/[^a-zA-Z0-9_-]/g, "-");
      if (servers[name]) return errorResult(`"${name}" is already configured in ${file} — edit it there.`);
      servers[name] = mcpServerConfig(entry);
      writeJson(file, { ...raw, mcpServers: servers }, 0o600);
      return textResult(
        `Added "${name}" to ${file} (DISABLED — the catalog does not know its start command).\n` +
          `Fill in the command from the docs (${entry.url}), set enabled: true, then restart XMINAL. The agent can call mcp_search/mcp_add again any time.`,
      );
    } catch (error) {
      return errorResult(`Could not update ${file}: ${(error as Error)?.message ?? String(error)}`);
    }
  },
};

export const capabilityTools: Tool[] = [capabilitiesTool, mcpSearchTool, mcpAddTool];
