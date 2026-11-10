import { VERSION } from "../version";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { McpServerConfig } from "../config/types";

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export class McpClient {
  private child: ChildProcessWithoutNullStreams;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private started = false;
  private closed = false;
  private stderr = "";

  constructor(
    readonly name: string,
    private readonly config: McpServerConfig,
  ) {
    const [command, ...args] = config.command;
    if (!command) throw new Error(`MCP server "${name}" has an empty command`);
    this.child = spawn(command, args, {
      env: { ...process.env, ...(config.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.onData(chunk));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
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

  private onData(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) this.onMessage(line);
      index = this.buffer.indexOf("\n");
    }
  }

  private onMessage(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(JSON.stringify(message.error)));
    } else {
      pending.resolve(message.result);
    }
  }

  private request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error(`MCP server "${this.name}" is closed. ${this.stderr}`));
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

  private notify(method: string, params: Record<string, unknown> = {}): void {
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "xminal", version: VERSION },
    });
    this.notify("notifications/initialized", {});
  }

  async listTools(): Promise<McpTool[]> {
    await this.start();
    const result = (await this.request("tools/list", {})) as { tools?: McpTool[] };
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.start();
    return this.request("tools/call", { name, arguments: args });
  }

  close(): void {
    this.closed = true;
    try {
      this.child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
}

export class McpManager {
  private clients = new Map<string, McpClient>();

  constructor(private readonly servers: Record<string, McpServerConfig>) {}

  private enabledServers(): Array<[string, McpServerConfig]> {
    return Object.entries(this.servers).filter(([, config]) => config.enabled !== false);
  }

  getClient(name: string): McpClient {
    const config = this.servers[name];
    if (!config) throw new Error(`Unknown MCP server: ${name}`);
    let client = this.clients.get(name);
    if (!client) {
      client = new McpClient(name, config);
      this.clients.set(name, client);
    }
    return client;
  }

  listServerNames(): string[] {
    return this.enabledServers().map(([name]) => name);
  }

  async listAllTools(): Promise<Array<{ server: string; tool: McpTool }>> {
    const out: Array<{ server: string; tool: McpTool }> = [];
    for (const [name] of this.enabledServers()) {
      try {
        const tools = await this.getClient(name).listTools();
        for (const tool of tools) out.push({ server: name, tool });
      } catch {
        // server failed; skip
      }
    }
    return out;
  }

  async call(server: string, tool: string, args: Record<string, unknown>): Promise<unknown> {
    return this.getClient(server).callTool(tool, args);
  }

  closeAll(): void {
    for (const client of this.clients.values()) client.close();
    this.clients.clear();
  }
}
