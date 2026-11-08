"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpManager = exports.McpClient = void 0;
const node_child_process_1 = require("node:child_process");
class McpClient {
    name;
    config;
    child;
    buffer = "";
    nextId = 1;
    pending = new Map();
    started = false;
    closed = false;
    stderr = "";
    constructor(name, config) {
        this.name = name;
        this.config = config;
        const [command, ...args] = config.command;
        if (!command)
            throw new Error(`MCP server "${name}" has an empty command`);
        this.child = (0, node_child_process_1.spawn)(command, args, {
            env: { ...process.env, ...(config.env ?? {}) },
            stdio: ["pipe", "pipe", "pipe"],
        });
        this.child.stdout.setEncoding("utf8");
        this.child.stdout.on("data", (chunk) => this.onData(chunk));
        this.child.stderr.setEncoding("utf8");
        this.child.stderr.on("data", (chunk) => {
            this.stderr = (this.stderr + chunk).slice(-4000);
        });
        this.child.on("exit", (code) => {
            this.closed = true;
            for (const [id, pending] of this.pending) {
                clearTimeout(pending.timer);
                pending.reject(new Error(`MCP server "${this.name}" exited (code ${code})`));
                this.pending.delete(id);
            }
        });
        this.child.on("error", (error) => {
            this.closed = true;
            for (const [id, pending] of this.pending) {
                clearTimeout(pending.timer);
                pending.reject(new Error(`MCP server "${this.name}" failed: ${error.message}`));
                this.pending.delete(id);
            }
        });
    }
    onData(chunk) {
        this.buffer += chunk;
        let index = this.buffer.indexOf("\n");
        while (index >= 0) {
            const line = this.buffer.slice(0, index).trim();
            this.buffer = this.buffer.slice(index + 1);
            if (line)
                this.onMessage(line);
            index = this.buffer.indexOf("\n");
        }
    }
    onMessage(line) {
        let message;
        try {
            message = JSON.parse(line);
        }
        catch {
            return;
        }
        if (typeof message.id !== "number")
            return;
        const pending = this.pending.get(message.id);
        if (!pending)
            return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) {
            pending.reject(new Error(JSON.stringify(message.error)));
        }
        else {
            pending.resolve(message.result);
        }
    }
    request(method, params = {}) {
        if (this.closed)
            return Promise.reject(new Error(`MCP server "${this.name}" is closed. ${this.stderr}`));
        const id = this.nextId++;
        const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
        return new Promise((resolve, reject) => {
            const timeout = this.config.timeoutMs ?? 30000;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`MCP request timed out: ${this.name}.${method}`));
            }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            this.child.stdin.write(payload + "\n");
        });
    }
    notify(method, params = {}) {
        this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
    }
    async start() {
        if (this.started)
            return;
        this.started = true;
        await this.request("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "xminal", version: "0.1.0" },
        });
        this.notify("notifications/initialized", {});
    }
    async listTools() {
        await this.start();
        const result = (await this.request("tools/list", {}));
        return result.tools ?? [];
    }
    async callTool(name, args) {
        await this.start();
        return this.request("tools/call", { name, arguments: args });
    }
    close() {
        this.closed = true;
        try {
            this.child.kill("SIGTERM");
        }
        catch {
            // ignore
        }
    }
}
exports.McpClient = McpClient;
class McpManager {
    servers;
    clients = new Map();
    constructor(servers) {
        this.servers = servers;
    }
    enabledServers() {
        return Object.entries(this.servers).filter(([, config]) => config.enabled !== false);
    }
    getClient(name) {
        const config = this.servers[name];
        if (!config)
            throw new Error(`Unknown MCP server: ${name}`);
        let client = this.clients.get(name);
        if (!client) {
            client = new McpClient(name, config);
            this.clients.set(name, client);
        }
        return client;
    }
    listServerNames() {
        return this.enabledServers().map(([name]) => name);
    }
    async listAllTools() {
        const out = [];
        for (const [name] of this.enabledServers()) {
            try {
                const tools = await this.getClient(name).listTools();
                for (const tool of tools)
                    out.push({ server: name, tool });
            }
            catch {
                // server failed; skip
            }
        }
        return out;
    }
    async call(server, tool, args) {
        return this.getClient(server).callTool(tool, args);
    }
    closeAll() {
        for (const client of this.clients.values())
            client.close();
        this.clients.clear();
    }
}
exports.McpManager = McpManager;
//# sourceMappingURL=client.js.map