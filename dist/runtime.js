"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Runtime = void 0;
const config_1 = require("./config/config");
const paths_1 = require("./config/paths");
const fs_1 = require("./util/fs");
const session_1 = require("./core/session");
const permissions_1 = require("./core/permissions");
const agent_1 = require("./core/agent");
const store_1 = require("./memory/store");
const loader_1 = require("./skills/loader");
const client_1 = require("./mcp/client");
const registry_1 = require("./tools/registry");
const index_1 = require("./tools/index");
class Runtime {
    cwd;
    options;
    loaded;
    config;
    session;
    permissions;
    memory;
    skills;
    mcp;
    tools;
    agent;
    constructor(cwd, options = {}) {
        this.cwd = cwd;
        this.options = options;
        this.loaded = (0, config_1.loadConfig)(cwd);
        this.config = this.loaded.config;
        this.memory = new store_1.MemoryStore(cwd);
        this.skills = new loader_1.SkillRegistry(cwd);
        this.mcp = new client_1.McpManager(this.config.mcpServers);
        this.tools = new registry_1.ToolRegistry();
        this.tools.registerAll((0, index_1.allTools)());
        const mode = this.options.mode ?? (this.config.permissions.mode === "full" ? "yolo" : "build");
        const effectiveModel = this.options.model ?? this.config.defaultModel;
        if (this.options.sessionId) {
            this.session = session_1.Session.load(cwd, this.options.sessionId);
            if (this.options.model)
                this.session.setModel(this.options.model);
        }
        else if (!this.options.newSession) {
            const latest = session_1.Session.latest(cwd);
            this.session = latest ?? session_1.Session.create(cwd, { model: effectiveModel, mode: this.config.permissions.mode, agentMode: mode });
            if (this.options.model && this.session.meta.model !== this.options.model)
                this.session.setModel(this.options.model);
        }
        else {
            this.session = session_1.Session.create(cwd, { model: effectiveModel, mode: this.config.permissions.mode, agentMode: mode });
        }
        const permissionMode = mode === "yolo" ? "full" : this.config.permissions.mode;
        this.permissions = new permissions_1.PermissionManager(cwd, permissionMode, this.config.permissions.protectedPaths, this.options.askHandler);
        this.agent = this.makeAgent({ mode, model: this.options.model, callbacks: this.options.callbacks });
    }
    setAskHandler(handler) {
        this.permissions.setAskHandler(handler);
    }
    setProviderKey(provider, apiKey) {
        const current = this.config.providers[provider];
        if (!current)
            return;
        this.config.providers = { ...this.config.providers, [provider]: { ...current, apiKey } };
        try {
            const raw = (0, fs_1.exists)((0, paths_1.globalConfigPath)())
                ? (0, fs_1.readJson)((0, paths_1.globalConfigPath)(), {})
                : {};
            const providers = { ...(raw.providers ?? {}), [provider]: { ...(raw.providers?.[provider] ?? current), apiKey } };
            (0, fs_1.writeJson)((0, paths_1.globalConfigPath)(), { ...raw, providers });
        }
        catch {
            try {
                (0, config_1.saveGlobalConfig)(this.config);
            }
            catch { /* best effort */ }
        }
    }
    setMode(mode) {
        this.agent.setMode(mode);
        if (mode === "yolo")
            this.permissions.setMode("full");
    }
    makeAgent(overrides = {}) {
        const mode = overrides.mode ?? this.session.meta.agentMode ?? "build";
        return new agent_1.Agent({
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
    sessionSummaries() {
        return session_1.Session.list(this.cwd);
    }
    close() {
        this.mcp.closeAll();
    }
}
exports.Runtime = Runtime;
//# sourceMappingURL=runtime.js.map