import { loadConfig, saveGlobalConfig, type LoadedConfig } from "./config/config";
import { globalConfigPath } from "./config/paths";
import { exists, readJson, writeJson } from "./util/fs";
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
    const effectiveModel = this.options.model ?? this.config.defaultModel;
    if (this.options.sessionId) {
      this.session = Session.load(cwd, this.options.sessionId);
      if (this.options.model) this.session.setModel(this.options.model);
    } else if (!this.options.newSession) {
      const latest = Session.latest(cwd);
      this.session = latest ?? Session.create(cwd, { model: effectiveModel, mode: this.config.permissions.mode, agentMode: mode });
      if (this.options.model && this.session.meta.model !== this.options.model) this.session.setModel(this.options.model);
    } else {
      this.session = Session.create(cwd, { model: effectiveModel, mode: this.config.permissions.mode, agentMode: mode });
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

  setProviderKey(provider: string, apiKey: string): void {
    const current = this.config.providers[provider];
    if (!current) return;
    this.config.providers = { ...this.config.providers, [provider]: { ...current, apiKey } };
    try {
      const raw = exists(globalConfigPath())
        ? readJson<Partial<XminalConfig>>(globalConfigPath(), {})
        : {};
      const providers = { ...(raw.providers ?? {}), [provider]: { ...(raw.providers?.[provider] ?? current), apiKey } };
      writeJson(globalConfigPath(), { ...raw, providers });
    } catch {
      try { saveGlobalConfig(this.config); } catch { /* best effort */ }
    }
  }

  setMode(mode: AgentMode): void {
    this.agent.setMode(mode);
    if (mode === "yolo") this.permissions.setMode("full");
  }

  setEffort(effort: import("./core/agent").AgentEffort): void {
    this.agent.setEffort(effort);
  }

  getEffort(): import("./core/agent").AgentEffort {
    return this.agent.effort;
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
