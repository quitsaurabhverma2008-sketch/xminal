"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installSkill = installSkill;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const fs_1 = require("../util/fs");
const paths_1 = require("../config/paths");
const node_os_1 = __importDefault(require("node:os"));
const GIT_URL = /^(https?:\/\/|git@|ssh:\/\/).+|^.*\.git$/i;
function installSkill(cwd, target, options = {}) {
    const skillsRoot = options.global ? node_path_1.default.join(node_os_1.default.homedir(), ".xminal", "skills") : (0, paths_1.projectSkillsDir)(cwd);
    (0, fs_1.ensureDir)(skillsRoot);
    if ((0, fs_1.exists)(target)) {
        const source = node_fs_1.default.statSync(target).isDirectory() ? target : node_path_1.default.dirname(target);
        const skillFile = node_path_1.default.join(source, "SKILL.md");
        if (!(0, fs_1.exists)(skillFile)) {
            throw new Error(`No SKILL.md found in ${source}. A skill folder must contain SKILL.md.`);
        }
        const name = node_path_1.default.basename(source);
        const destination = node_path_1.default.join(skillsRoot, name);
        node_fs_1.default.rmSync(destination, { recursive: true, force: true });
        node_fs_1.default.cpSync(source, destination, { recursive: true });
        return { name, destination, source: "folder" };
    }
    if (!GIT_URL.test(target)) {
        throw new Error(`Skill path not found: ${target} (provide a local folder or a git URL).`);
    }
    const base = target.split("/").pop()?.replace(/\.git$/, "") ?? "skill";
    const name = base.replace(/[^A-Za-z0-9._-]+/g, "-");
    const destination = node_path_1.default.join(skillsRoot, name);
    node_fs_1.default.rmSync(destination, { recursive: true, force: true });
    const result = (0, node_child_process_1.spawnSync)("git", ["clone", "--depth", "1", "--", target, destination], {
        encoding: "utf8",
        timeout: 120_000,
    });
    if (result.status !== 0) {
        node_fs_1.default.rmSync(destination, { recursive: true, force: true });
        throw new Error(`git clone failed (${result.status ?? "timeout"}): ${(result.stderr || result.stdout || "").trim()}`);
    }
    if (!(0, fs_1.exists)(node_path_1.default.join(destination, "SKILL.md"))) {
        node_fs_1.default.rmSync(destination, { recursive: true, force: true });
        throw new Error(`Cloned ${target} but found no SKILL.md at its root.`);
    }
    return { name, destination, source: "git" };
}
//# sourceMappingURL=install.js.map