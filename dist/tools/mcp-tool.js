"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mcpTools = void 0;
const types_1 = require("./types");
const fs_1 = require("../util/fs");
const mcpListTool = {
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
        const requested = (0, types_1.stringArg)(args, "server");
        const servers = context.mcp.listServerNames();
        if (servers.length === 0)
            return (0, types_1.textResult)("(no MCP servers configured)");
        if (requested) {
            if (!servers.includes(requested))
                return (0, types_1.errorResult)(`Unknown MCP server: ${requested}`);
            try {
                const tools = await context.mcp.listAllTools();
                const filtered = tools.filter((entry) => entry.server === requested);
                return (0, types_1.textResult)(filtered.length
                    ? filtered.map((entry) => `${entry.tool.name} — ${entry.tool.description ?? ""}`).join("\n")
                    : `(no tools from ${requested})`);
            }
            catch (error) {
                return (0, types_1.errorResult)(`MCP server failed: ${error.message}`);
            }
        }
        const lines = [`Servers: ${servers.join(", ")}`];
        try {
            const tools = await context.mcp.listAllTools();
            for (const entry of tools) {
                lines.push(`${entry.server}__${entry.tool.name} — ${entry.tool.description ?? ""}`);
            }
        }
        catch (error) {
            lines.push(`(failed to list tools: ${error.message})`);
        }
        return (0, types_1.textResult)(lines.join("\n"));
    },
};
const mcpCallTool = {
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
        const server = (0, types_1.stringArg)(args, "server");
        const tool = (0, types_1.stringArg)(args, "tool");
        if (!server || !tool)
            return (0, types_1.errorResult)("server and tool are required.");
        let toolArgs = {};
        if (args.arguments && typeof args.arguments === "object") {
            toolArgs = args.arguments;
        }
        else if (typeof args.arguments === "string") {
            try {
                toolArgs = JSON.parse(args.arguments);
            }
            catch (error) {
                return (0, types_1.errorResult)(`Invalid arguments JSON: ${error.message}`);
            }
        }
        try {
            const result = await context.mcp.call(server, tool, toolArgs);
            return (0, types_1.textResult)((0, fs_1.truncateText)(JSON.stringify(result, null, 2), 30_000));
        }
        catch (error) {
            return (0, types_1.errorResult)(`MCP call failed: ${error.message}`);
        }
    },
};
exports.mcpTools = [mcpListTool, mcpCallTool];
//# sourceMappingURL=mcp-tool.js.map