import { loadConfig, type LoadedConfig } from "./config/config";
import { Session, type SessionMeta } from "./core/session";
import { PermissionManager, type AskHandler } from "./core/permissions";
import { Agent, type AgentCallbacks, type AgentMode } from "./core/agent";
import { MemoryStore } from "./memory/store";
import { SkillRegistry } from "./skills/loader";
import { McpManager } from "./mcp/client";
import { ToolRegistry } from "./tools/registry";
import { allTools } from "./tools/index";
import type { XminalConfig } from "./config/types";

export interface RuntimeOptions {
  mode?: AgentMode;
  model?: string;
  sessionId?: string;
  newSession?: boolean;
  callbacks?: AgentCallbacks;
  askHandler?: AskHandler;
}

export class Runtime {
  readonly loaded: LoadedConfig;
  readonly config: XminalConfig;
  readonly session: Session;
  readonly permissions: PermissionManager;
  readonly memory: MemoryStore;
  readonly skills: SkillRegistry;
  readonly mcp: McpManager;
  readonly tools: ToolRegistry;
  agent: Agent;

  constructor(
    readonly cwd: string,
    private readonly options: RuntimeOptions = {},
  ) {
    this.loaded = loadConfig(cwd);
    this.config = this.loaded.config;
    this.memory = new MemoryStore(cwd);
    this.skills = new SkillRegistry(cwd);
    this.mcp = new McpManager(this.config.mcpServers);
    this.tools = new ToolRegistry();
    this.tools.registerAll(allTools());

    const mode = this.options.mode ?? (this.config.permissions.mode === "full" ? "yolo" : "build");
    if (this.options.sessionId) {
      this.session = Session.load(cwd, this.options.sessionId);
    } else if (!this.options.newSession) {
      const latest = Session.latest(cwd);
      this.session = latest ?? Session.create(cwd, { model: this.config.defaultModel, mode: this.config.permissions.mode, agentMode: mode });
    } else {
      this.session = Session.create(cwd, { model: this.config.defaultModel, mode: this.config.permissions.mode, agentMode: mode });
    }

    const permissionMode = mode === "yolo" ? "full" : this.config.permissions.mode;
    this.permissions = new PermissionManager(
      cwd,
      permissionMode,
      this.config.permissions.protectedPaths,
      this.options.askHandler,
    );
    this.agent = this.makeAgent({ mode, model: this.options.model, callbacks: this.options.callbacks });
  }

  setAskHandler(handler: AskHandler | undefined): void {
    this.permissions.setAskHandler(handler);
  }

  setMode(mode: AgentMode): void {
    this.agent.setMode(mode);
    if (mode === "yolo") this.permissions.setMode("full");
  }

  makeAgent(overrides: {
    mode?: AgentMode;
    model?: string;
    callbacks?: AgentCallbacks;
    maxTurns?: number;
    ephemeral?: boolean;
  } = {}): Agent {
    const mode = overrides.mode ?? (this.session.meta.agentMode as AgentMode | undefined) ?? "build";
    return new Agent({
      cwd: this.cwd,
      config: this.config,
      session: this.session,
      permissions: this.permissions,
      tools: this.tools,
      memory: this.memory,
      skills: this.skills,
      mcp: this.mcp,
      mode,
      model: overrides.model ?? this.options.model ?? this.session.meta.model ?? this.config.defaultModel,
      callbacks: overrides.callbacks ?? this.options.callbacks,
      maxTurns: overrides.maxTurns,
      ephemeral: overrides.ephemeral,
    });
  }

  sessionSummaries(): SessionMeta[] {
    return Session.list(this.cwd);
  }

  close(): void {
    this.mcp.closeAll();
  }
}
