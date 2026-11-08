import readline from "node:readline";
import { loadConfig } from "../config/config";
import { Session } from "../core/session";
import { PermissionManager } from "../core/permissions";
import { MemoryStore } from "../memory/store";
import { SkillRegistry } from "../skills/loader";
import { McpManager } from "../mcp/client";
import { ToolRegistry } from "../tools/registry";
import { allTools } from "../tools/index";
import { VERSION } from "../version";
import type { ToolContext } from "../tools/types";

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

export async function startMcpStdioServer(cwd: string): Promise<void> {
  const { config } = loadConfig(cwd);
  const session = Session.create(cwd, { model: config.defaultModel, mode: config.permissions.mode, agentMode: "build" });
  const permissions = new PermissionManager(cwd, config.permissions.mode, config.permissions.protectedPaths);
  const memory = new MemoryStore(cwd);
  const skills = new SkillRegistry(cwd);
  const mcp = new McpManager(config.mcpServers);
  const tools = new ToolRegistry();
  tools.registerAll(allTools());

  const context: ToolContext = {
    cwd,
    session,
    config,
    permissions,
    memory,
    skills,
    mcp,
  };

  const send = (message: Record<string, unknown>) => {
    process.stdout.write(JSON.stringify(message) + "\n");
  };

  const toolsList = () =>
    tools.defs(false).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parameters,
    }));

  const shutdown = () => {
    mcp.closeAll();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(line) as JsonRpcMessage;
    } catch {
      return;
    }
    const id = message.id;
    const method = message.method;

    if (method === "initialize") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "xminal", version: VERSION },
        },
      });
      return;
    }
    if (method === "notifications/initialized") return;
    if (method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
      return;
    }
    if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools: toolsList() } });
      return;
    }
    if (method === "tools/call") {
      const params = (message.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      const name = String(params.name ?? "");
      const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
      if (!name) {
        send({ jsonrpc: "2.0", id, error: { code: -32602, message: "tool name is required" } });
        return;
      }
      try {
        const result = await tools.execute(name, args, context);
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: result.content }],
            isError: Boolean(result.isError),
          },
        });
      } catch (error) {
        send({ jsonrpc: "2.0", id, error: { code: -32000, message: (error as Error).message } });
      }
      return;
    }
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
  });
  rl.on("close", shutdown);
}
