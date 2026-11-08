"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillRegistry = void 0;
exports.skillLockPath = skillLockPath;
exports.hashSkills = hashSkills;
exports.hashProjectSkills = hashProjectSkills;
exports.verifySkills = verifySkills;
exports.writeSkillsLock = writeSkillsLock;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const fs_1 = require("../util/fs");
function skillLockPath(cwd, lockPath) {
    return lockPath ?? node_path_1.default.join(cwd, ".xminal", "skills.lock.json");
}
function hashSkills(skills) {
    const hashes = {};
    for (const skill of skills) {
        hashes[skill.name] = (0, fs_1.sha256)((0, fs_1.readText)(skill.path));
    }
    return hashes;
}
function hashProjectSkills(cwd) {
    const projectSkills = new SkillRegistry(cwd).list().filter((skill) => skill.source === "project");
    return hashSkills(projectSkills);
}
function verifySkills(cwd, lockPath) {
    const file = skillLockPath(cwd, lockPath);
    const current = hashProjectSkills(cwd);
    const lock = (0, fs_1.readJson)(file, {});
    const added = Object.keys(current).filter((name) => !(name in lock));
    const removed = Object.keys(lock).filter((name) => !(name in current));
    const changed = Object.keys(current).filter((name) => lock[name] && lock[name] !== current[name]);
    return {
        total: Object.keys(current).length,
        added,
        changed,
        removed,
        ok: added.length + changed.length + removed.length === 0,
        lockPath: file,
    };
}
function writeSkillsLock(cwd, lockPath) {
    const hashes = hashProjectSkills(cwd);
    (0, fs_1.writeJson)(skillLockPath(cwd, lockPath), hashes);
    return Object.keys(hashes).length;
}
class SkillRegistry {
    cwd;
    cache = null;
    constructor(cwd) {
        this.cwd = cwd;
    }
    roots() {
        return [
            { dir: node_path_1.default.join(this.cwd, ".xminal", "skills"), source: "project" },
            { dir: node_path_1.default.join(this.cwd, ".opencode", "skills"), source: "project" },
            { dir: node_path_1.default.join(this.cwd, ".claude", "skills"), source: "project" },
            { dir: node_path_1.default.join(node_os_1.default.homedir(), ".agents", "skills"), source: "global" },
            { dir: node_path_1.default.join(node_os_1.default.homedir(), ".claude", "skills"), source: "global" },
            { dir: node_path_1.default.join(node_os_1.default.homedir(), ".xminal", "skills"), source: "global" },
        ];
    }
    list() {
        if (this.cache)
            return this.cache;
        const found = new Map();
        for (const root of this.roots()) {
            if (!(0, fs_1.exists)(root.dir))
                continue;
            let entries;
            try {
                entries = node_fs_1.default.readdirSync(root.dir, { withFileTypes: true });
            }
            catch {
                continue;
            }
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                const skillFile = node_path_1.default.join(root.dir, entry.name, "SKILL.md");
                if (!(0, fs_1.exists)(skillFile))
                    continue;
                const parsed = parseSkill((0, fs_1.readText)(skillFile), entry.name);
                if (!found.has(parsed.name)) {
                    found.set(parsed.name, { ...parsed, path: skillFile, source: root.source });
                }
            }
        }
        this.cache = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
        return this.cache;
    }
    load(name) {
        const skill = this.get(name);
        if (!skill)
            throw new Error(`Skill not found: ${name}`);
        return (0, fs_1.readText)(skill.path);
    }
    get(name) {
        return this.list().find((skill) => skill.name === name);
    }
    renderForPrompt(limit = 40) {
        const skills = this.list().slice(0, limit);
        if (skills.length === 0)
            return "";
        return skills
            .map((skill) => `- ${skill.name}: ${skill.description.slice(0, 220)}`)
            .join("\n");
    }
}
exports.SkillRegistry = SkillRegistry;
function parseSkill(content, folderName) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) {
        return { name: folderName, description: firstNonEmptyLine(content) };
    }
    const frontmatter = match[1];
    const fields = {};
    let currentKey = "";
    for (const line of frontmatter.split(/\r?\n/)) {
        const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (keyMatch) {
            currentKey = keyMatch[1];
            fields[currentKey] = keyMatch[2].trim();
        }
        else if (currentKey && line.trim()) {
            fields[currentKey] += " " + line.trim();
        }
    }
    const name = (fields.name || folderName).replace(/^["']|["']$/g, "");
    const description = (fields.description || firstNonEmptyLine(content)).replace(/^["']|["']$/g, "");
    return { name, description };
}
function firstNonEmptyLine(content) {
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.replace(/^#+\s*/, "").trim();
        if (trimmed && trimmed !== "---")
            return trimmed;
    }
    return "";
}
//# sourceMappingURL=loader.js.map