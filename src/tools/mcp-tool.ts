import type { Tool } from "./types";
import { errorResult, stringArg, textResult } from "./types";
import { truncateText } from "../util/fs";

const mcpListTool: Tool = {
  name: "mcp_list",
  description: "List configured MCP servers and their available tools.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      server: { type: "string", description: "Optional server name to list tools for." },
    },
  },
  async run(args, context) {
    const requested = stringArg(args, "server");
    const servers = context.mcp.listServerNames();
    if (servers.length === 0) return textResult("(no MCP servers configured)");
    if (requested) {
      if (!servers.includes(requested)) return errorResult(`Unknown MCP server: ${requested}`);
      try {
        const tools = await context.mcp.listAllTools();
        const filtered = tools.filter((entry) => entry.server === requested);
        return textResult(
          filtered.length
            ? filtered.map((entry) => `${entry.tool.name} — ${entry.tool.description ?? ""}`).join("\n")
            : `(no tools from ${requested})`,
        );
      } catch (error) {
        return errorResult(`MCP server failed: ${(error as Error).message}`);
      }
    }
    const lines: string[] = [`Servers: ${servers.join(", ")}`];
    try {
      const tools = await context.mcp.listAllTools();
      for (const entry of tools) {
        lines.push(`${entry.server}__${entry.tool.name} — ${entry.tool.description ?? ""}`);
      }
    } catch (error) {
      lines.push(`(failed to list tools: ${(error as Error).message})`);
    }
    return textResult(lines.join("\n"));
  },
};

const mcpCallTool: Tool = {
  name: "mcp_call",
  description: "Call a tool exposed by a configured MCP server. Arguments are passed as an object.",
  parameters: {
    type: "object",
    properties: {
      server: { type: "string", description: "MCP server name." },
      tool: { type: "string", description: "Tool name." },
      arguments: {
        type: "object",
        description: "Tool arguments object.",
        additionalProperties: true,
      },
    },
    required: ["server", "tool"],
  },
  async run(args, context) {
    const server = stringArg(args, "server");
    const tool = stringArg(args, "tool");
    if (!server || !tool) return errorResult("server and tool are required.");
    let toolArgs: Record<string, unknown> = {};
    if (args.arguments && typeof args.arguments === "object") {
      toolArgs = args.arguments as Record<string, unknown>;
    } else if (typeof args.arguments === "string") {
      try {
        toolArgs = JSON.parse(args.arguments) as Record<string, unknown>;
      } catch (error) {
        return errorResult(`Invalid arguments JSON: ${(error as Error).message}`);
      }
    }
    try {
      const result = await context.mcp.call(server, tool, toolArgs);
      return textResult(truncateText(JSON.stringify(result, null, 2), 30_000));
    } catch (error) {
      return errorResult(`MCP call failed: ${(error as Error).message}`);
    }
  },
};

export const mcpTools: Tool[] = [mcpListTool, mcpCallTool];
