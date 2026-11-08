"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandHome = expandHome;
exports.ensureDir = ensureDir;
exports.readJson = readJson;
exports.writeJson = writeJson;
exports.readText = readText;
exports.writeText = writeText;
exports.appendLine = appendLine;
exports.exists = exists;
exports.isBinary = isBinary;
exports.sha256 = sha256;
exports.shortHash = shortHash;
exports.truncateText = truncateText;
exports.walkFiles = walkFiles;
exports.relativeTo = relativeTo;
exports.copyFileWithDirs = copyFileWithDirs;
exports.removeDir = removeDir;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const node_crypto_1 = __importDefault(require("node:crypto"));
function expandHome(input) {
    if (input === "~")
        return node_os_1.default.homedir();
    if (input.startsWith("~/"))
        return node_path_1.default.join(node_os_1.default.homedir(), input.slice(2));
    return input;
}
function ensureDir(dir) {
    node_fs_1.default.mkdirSync(dir, { recursive: true });
}
function readJson(file, fallback) {
    try {
        return JSON.parse(node_fs_1.default.readFileSync(file, "utf8"));
    }
    catch {
        return fallback;
    }
}
function writeJson(file, value) {
    ensureDir(node_path_1.default.dirname(file));
    node_fs_1.default.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}
function readText(file) {
    return node_fs_1.default.readFileSync(file, "utf8");
}
function writeText(file, content) {
    ensureDir(node_path_1.default.dirname(file));
    node_fs_1.default.writeFileSync(file, content, "utf8");
}
function appendLine(file, line) {
    ensureDir(node_path_1.default.dirname(file));
    node_fs_1.default.appendFileSync(file, line + "\n", "utf8");
}
function exists(file) {
    try {
        node_fs_1.default.accessSync(file);
        return true;
    }
    catch {
        return false;
    }
}
function isBinary(buffer) {
    const len = Math.min(buffer.length, 4096);
    for (let i = 0; i < len; i++) {
        if (buffer[i] === 0)
            return true;
    }
    return false;
}
function sha256(text) {
    return node_crypto_1.default.createHash("sha256").update(text).digest("hex");
}
function shortHash(text, length = 8) {
    return sha256(text).slice(0, length);
}
function truncateText(text, maxChars, note = "…[truncated]") {
    if (text.length <= maxChars)
        return text;
    const head = Math.floor(maxChars * 0.75);
    const tail = Math.max(0, maxChars - head);
    return text.slice(0, head) + `\n${note} (${text.length - maxChars} chars)\n` + text.slice(text.length - tail);
}
function walkFiles(root, options = {}) {
    const maxFiles = options.maxFiles ?? 20000;
    const ignore = new Set(options.ignore ?? ["node_modules", ".git", "dist", ".xminal", "coverage", ".next", "build"]);
    const out = [];
    const stack = [root];
    while (stack.length && out.length < maxFiles) {
        const current = stack.pop();
        let entries;
        try {
            entries = node_fs_1.default.readdirSync(current, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (entry.name.startsWith(".") && entry.name !== ".env.example") {
                if (ignore.has(entry.name))
                    continue;
            }
            if (ignore.has(entry.name))
                continue;
            const full = node_path_1.default.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
            }
            else if (entry.isFile()) {
                out.push(full);
            }
        }
    }
    return out;
}
function relativeTo(base, file) {
    const rel = node_path_1.default.relative(base, file);
    return rel === "" ? "." : rel;
}
function copyFileWithDirs(src, dest) {
    ensureDir(node_path_1.default.dirname(dest));
    node_fs_1.default.copyFileSync(src, dest);
}
function removeDir(dir) {
    node_fs_1.default.rmSync(dir, { recursive: true, force: true });
}
//# sourceMappingURL=fs.js.map