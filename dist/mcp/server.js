"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMcpStdioServer = startMcpStdioServer;
const node_readline_1 = __importDefault(require("node:readline"));
const config_1 = require("../config/config");
const session_1 = require("../core/session");
const permissions_1 = require("../core/permissions");
const store_1 = require("../memory/store");
const loader_1 = require("../skills/loader");
const client_1 = require("../mcp/client");
const registry_1 = require("../tools/registry");
const index_1 = require("../tools/index");
const version_1 = require("../version");
async function startMcpStdioServer(cwd) {
    const { config } = (0, config_1.loadConfig)(cwd);
    const session = session_1.Session.create(cwd, { model: config.defaultModel, mode: config.permissions.mode, agentMode: "build" });
    const permissions = new permissions_1.PermissionManager(cwd, config.permissions.mode, config.permissions.protectedPaths);
    const memory = new store_1.MemoryStore(cwd);
    const skills = new loader_1.SkillRegistry(cwd);
    const mcp = new client_1.McpManager(config.mcpServers);
    const tools = new registry_1.ToolRegistry();
    tools.registerAll((0, index_1.allTools)());
    const context = {
        cwd,
        session,
        config,
        permissions,
        memory,
        skills,
        mcp,
    };
    const send = (message) => {
        process.stdout.write(JSON.stringify(message) + "\n");
    };
    const toolsList = () => tools.defs(false).map((tool) => ({
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
    const rl = node_readline_1.default.createInterface({ input: process.stdin, terminal: false });
    rl.on("line", async (line) => {
        if (!line.trim())
            return;
        let message;
        try {
            message = JSON.parse(line);
        }
        catch {
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
                    serverInfo: { name: "xminal", version: version_1.VERSION },
                },
            });
            return;
        }
        if (method === "notifications/initialized")
            return;
        if (method === "ping") {
            send({ jsonrpc: "2.0", id, result: {} });
            return;
        }
        if (method === "tools/list") {
            send({ jsonrpc: "2.0", id, result: { tools: toolsList() } });
            return;
        }
        if (method === "tools/call") {
            const params = (message.params ?? {});
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
            }
            catch (error) {
                send({ jsonrpc: "2.0", id, error: { code: -32000, message: error.message } });
            }
            return;
        }
        send({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
    });
    rl.on("close", shutdown);
}
//# sourceMappingURL=server.js.map