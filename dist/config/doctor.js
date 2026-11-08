"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDoctor = runDoctor;
exports.formatDoctor = formatDoctor;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const node_child_process_1 = require("node:child_process");
const config_1 = require("./config");
const fs_1 = require("../util/fs");
const paths_1 = require("./paths");
function runDoctor(cwd, loaded) {
    const checks = [];
    const nodeMajor = Number(process.version.replace(/^v/, "").split(".")[0]);
    checks.push({
        name: "Node.js",
        status: nodeMajor >= 18 ? "ok" : "fail",
        detail: `${process.version}${nodeMajor >= 18 ? "" : " (need >= 18)"}`,
    });
    checks.push({
        name: "Platform",
        status: "ok",
        detail: `${node_os_1.default.platform()} ${node_os_1.default.arch()} · ${node_os_1.default.homedir()}`,
    });
    checks.push({
        name: "Global config",
        status: (0, fs_1.exists)(loaded.globalPath) ? "ok" : "warn",
        detail: (0, fs_1.exists)(loaded.globalPath) ? loaded.globalPath : `${loaded.globalPath} missing (using defaults)`,
    });
    checks.push({
        name: "Project config",
        status: loaded.projectExists ? "ok" : "warn",
        detail: loaded.projectExists ? loaded.projectPath : `${loaded.projectPath} missing (run: xminal init)`,
    });
    const providers = Object.entries(loaded.config.providers);
    const ready = providers.filter(([, provider]) => (0, config_1.providerReady)(provider));
    checks.push({
        name: "Providers",
        status: ready.length > 0 ? "ok" : "fail",
        detail: ready.length > 0
            ? ready.map(([name]) => name).join(", ")
            : "no credentials. Set OPENROUTER_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY or configure ~/.xminal/config.json",
    });
    const aliases = (0, config_1.listModelAliases)(loaded.config);
    const head = aliases.slice(0, 6).join(", ");
    checks.push({
        name: "Model aliases",
        status: "ok",
        detail: `${aliases.length} configured · ${head}${aliases.length > 6 ? ` … (+${aliases.length - 6} more)` : ""} · default ${loaded.config.defaultModel}`,
    });
    for (const dir of [(0, paths_1.globalXminalDir)(), (0, paths_1.projectXminalDir)(cwd), (0, paths_1.projectSessionsDir)(cwd)]) {
        try {
            node_fs_1.default.mkdirSync(dir, { recursive: true });
            node_fs_1.default.accessSync(dir, node_fs_1.default.constants.W_OK);
            checks.push({ name: "Writable", status: "ok", detail: dir });
        }
        catch (error) {
            checks.push({ name: "Writable", status: "fail", detail: `${dir}: ${error.message}` });
        }
    }
    const git = (0, node_child_process_1.spawnSync)("git", ["rev-parse", "--is-inside-work-tree"], { cwd, encoding: "utf8" });
    checks.push({
        name: "Git",
        status: git.status === 0 ? "ok" : "warn",
        detail: git.status === 0 ? "inside a git work tree" : "not a git repository (worktrees/undo-diff limited)",
    });
    const bwrap = (0, node_child_process_1.spawnSync)("sh", ["-c", "command -v bwrap"], { encoding: "utf8" });
    checks.push({
        name: "Sandbox",
        status: bwrap.status === 0 ? "ok" : "warn",
        detail: bwrap.status === 0 ? "bubblewrap available" : "bwrap not found (sandbox backend unavailable)",
    });
    const skills = node_fs_1.default.existsSync(node_path_1.default.join(node_os_1.default.homedir(), ".agents", "skills"))
        ? node_fs_1.default.readdirSync(node_path_1.default.join(node_os_1.default.homedir(), ".agents", "skills")).filter((name) => node_fs_1.default.existsSync(node_path_1.default.join(node_os_1.default.homedir(), ".agents", "skills", name, "SKILL.md"))).length
        : 0;
    checks.push({
        name: "Skills",
        status: skills > 0 ? "ok" : "warn",
        detail: `${skills} skill(s) in ~/.agents/skills`,
    });
    const mcpCount = Object.keys(loaded.config.mcpServers).length;
    checks.push({
        name: "MCP",
        status: mcpCount > 0 ? "ok" : "warn",
        detail: mcpCount > 0 ? `${mcpCount} server(s) configured` : "no MCP servers configured",
    });
    return checks;
}
function formatDoctor(checks) {
    return checks
        .map((check) => {
        const icon = check.status === "ok" ? "✓" : check.status === "warn" ? "!" : "✗";
        return `${icon} ${check.name}: ${check.detail}`;
    })
        .join("\n");
}
//# sourceMappingURL=doctor.js.map