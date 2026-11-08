"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fsTools = void 0;
exports.resolveToolPath = resolveToolPath;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const types_1 = require("./types");
const fs_1 = require("../util/fs");
const glob_1 = require("../util/glob");
const diff_1 = require("../util/diff");
function resolveToolPath(cwd, input) {
    if (!input)
        throw new Error("Path is required.");
    return node_path_1.default.resolve(cwd, (0, fs_1.expandHome)(input));
}
const readTool = {
    name: "read",
    description: "Read a text file from the project. Returns line-numbered content. Supports offset and limit for large files. Use this before editing a file.",
    readOnly: true,
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "File path (relative to project root or absolute)." },
            offset: { type: "number", description: "1-based starting line. Default 1." },
            limit: { type: "number", description: "Maximum lines to return. Default 2000." },
        },
        required: ["path"],
    },
    async run(args, context) {
        const file = resolveToolPath(context.cwd, (0, types_1.stringArg)(args, "path"));
        const stat = node_fs_1.default.statSync(file);
        if (stat.isDirectory())
            return (0, types_1.errorResult)(`${file} is a directory. Use the list tool.`);
        const buffer = node_fs_1.default.readFileSync(file);
        if ((0, fs_1.isBinary)(buffer))
            return (0, types_1.errorResult)(`Cannot read binary file: ${file}`);
        const text = buffer.toString("utf8");
        const lines = text.split("\n");
        const offset = Math.max(1, (0, types_1.numberArg)(args, "offset", 1));
        const limit = Math.max(1, Math.min(5000, (0, types_1.numberArg)(args, "limit", 2000)));
        const slice = lines.slice(offset - 1, offset - 1 + limit);
        const width = String(offset + slice.length - 1).length;
        const numbered = slice.map((line, index) => `${String(offset + index).padStart(width, " ")}: ${line}`).join("\n");
        const rel = (0, fs_1.relativeTo)(context.cwd, file);
        const header = `${rel} (${lines.length} lines${stat.size ? `, ${stat.size} bytes` : ""})`;
        return (0, types_1.textResult)(`${header}\n${(0, fs_1.truncateText)(numbered, 200_000)}`);
    },
};
const writeTool = {
    name: "write",
    description: "Create or overwrite a file with the given content. Parent directories are created automatically. A checkpoint is saved first so the change can be undone.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "File path." },
            content: { type: "string", description: "Full file content." },
        },
        required: ["path", "content"],
    },
    async run(args, context) {
        const file = resolveToolPath(context.cwd, (0, types_1.stringArg)(args, "path"));
        const content = (0, types_1.stringArg)(args, "content");
        let before = "";
        let existed = false;
        if (node_fs_1.default.existsSync(file)) {
            existed = true;
            before = node_fs_1.default.readFileSync(file, "utf8");
            context.session.createCheckpoint(`write:${(0, fs_1.relativeTo)(context.cwd, file)}`, [file]);
        }
        context.session.touch(file);
        (0, fs_1.ensureDir)(node_path_1.default.dirname(file));
        node_fs_1.default.writeFileSync(file, content, "utf8");
        const stat = (0, diff_1.diffStat)(before, content);
        const rel = (0, fs_1.relativeTo)(context.cwd, file);
        const preview = existed ? (0, diff_1.diffPreview)(before, content, 1, 24) : "";
        return (0, types_1.textResult)(`${existed ? "Updated" : "Created"} ${rel} (+${stat.added} −${stat.removed}, ${Buffer.byteLength(content)} bytes)` +
            (preview ? `\n${preview}` : ""), { path: rel, added: stat.added, removed: stat.removed });
    },
};
const editTool = {
    name: "edit",
    description: "Replace an exact string in a file. oldString must match exactly (including whitespace). Set replaceAll=true to replace every occurrence. A checkpoint is saved first.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "File path." },
            oldString: { type: "string", description: "Exact text to find." },
            newString: { type: "string", description: "Replacement text." },
            replaceAll: { type: "boolean", description: "Replace all occurrences (default false)." },
        },
        required: ["path", "oldString", "newString"],
    },
    async run(args, context) {
        const file = resolveToolPath(context.cwd, (0, types_1.stringArg)(args, "path"));
        if (!node_fs_1.default.existsSync(file))
            return (0, types_1.errorResult)(`File not found: ${file}`);
        const oldString = (0, types_1.stringArg)(args, "oldString");
        const newString = (0, types_1.stringArg)(args, "newString");
        if (oldString === newString)
            return (0, types_1.errorResult)("oldString and newString are identical.");
        const before = node_fs_1.default.readFileSync(file, "utf8");
        const count = countOccurrences(before, oldString);
        if (count === 0)
            return (0, types_1.errorResult)(`oldString not found in ${(0, fs_1.relativeTo)(context.cwd, file)}.`);
        if (count > 1 && !(0, types_1.booleanArg)(args, "replaceAll", false)) {
            return (0, types_1.errorResult)(`oldString occurs ${count} times. Provide more context or set replaceAll=true.`);
        }
        context.session.createCheckpoint(`edit:${(0, fs_1.relativeTo)(context.cwd, file)}`, [file]);
        context.session.touch(file);
        const after = (0, types_1.booleanArg)(args, "replaceAll", false)
            ? before.split(oldString).join(newString)
            : before.replace(oldString, newString);
        node_fs_1.default.writeFileSync(file, after, "utf8");
        const stat = (0, diff_1.diffStat)(before, after);
        const preview = (0, diff_1.diffPreview)(before, after, 2, 40);
        return (0, types_1.textResult)(`Edited ${(0, fs_1.relativeTo)(context.cwd, file)} (${count} replacement${count === 1 ? "" : "s"}, +${stat.added} −${stat.removed})\n${preview}`, { path: (0, fs_1.relativeTo)(context.cwd, file), replacements: count });
    },
};
const multiEditTool = {
    name: "multi_edit",
    description: "Apply multiple exact-string edits to one file atomically. A checkpoint is saved first.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "File path." },
            edits: {
                type: "array",
                description: "List of edits.",
                items: {
                    type: "object",
                    properties: {
                        oldString: { type: "string" },
                        newString: { type: "string" },
                        replaceAll: { type: "boolean" },
                    },
                    required: ["oldString", "newString"],
                },
            },
        },
        required: ["path", "edits"],
    },
    async run(args, context) {
        const file = resolveToolPath(context.cwd, (0, types_1.stringArg)(args, "path"));
        if (!node_fs_1.default.existsSync(file))
            return (0, types_1.errorResult)(`File not found: ${file}`);
        const edits = args.edits;
        if (!Array.isArray(edits) || edits.length === 0)
            return (0, types_1.errorResult)("edits must be a non-empty array.");
        let content = node_fs_1.default.readFileSync(file, "utf8");
        context.session.createCheckpoint(`multi_edit:${(0, fs_1.relativeTo)(context.cwd, file)}`, [file]);
        context.session.touch(file);
        const before = content;
        let applied = 0;
        for (const [index, raw] of edits.entries()) {
            const edit = raw;
            const oldString = (0, types_1.stringArg)(edit, "oldString");
            const newString = (0, types_1.stringArg)(edit, "newString");
            const replaceAll = (0, types_1.booleanArg)(edit, "replaceAll", false);
            if (!content.includes(oldString)) {
                return (0, types_1.errorResult)(`Edit #${index + 1} failed: oldString not found. No changes written.`);
            }
            content = replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString);
            applied++;
        }
        node_fs_1.default.writeFileSync(file, content, "utf8");
        return (0, types_1.textResult)(`Applied ${applied} edits to ${(0, fs_1.relativeTo)(context.cwd, file)} (+${(0, diff_1.diffStat)(before, content).added} −${(0, diff_1.diffStat)(before, content).removed})\n${(0, diff_1.diffPreview)(before, content, 1, 30)}`);
    },
};
const listTool = {
    name: "list",
    description: "List files and directories at a path. Directories are marked with a trailing slash.",
    readOnly: true,
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Directory path. Default project root." },
            depth: { type: "number", description: "Recursion depth (default 1, max 3)." },
            limit: { type: "number", description: "Maximum entries (default 300)." },
        },
    },
    async run(args, context) {
        const root = resolveToolPath(context.cwd, (0, types_1.stringArg)(args, "path", "."));
        const depth = Math.max(1, Math.min(3, (0, types_1.numberArg)(args, "depth", 1)));
        const limit = Math.max(1, Math.min(2000, (0, types_1.numberArg)(args, "limit", 300)));
        const lines = [];
        const walk = (dir, currentDepth, prefix) => {
            if (lines.length >= limit)
                return;
            let entries;
            try {
                entries = node_fs_1.default.readdirSync(dir, { withFileTypes: true });
            }
            catch (error) {
                lines.push(`${prefix}[error: ${error.message}]`);
                return;
            }
            entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
            for (const entry of entries) {
                if (lines.length >= limit)
                    return;
                if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist")
                    continue;
                if (entry.isDirectory()) {
                    lines.push(`${prefix}${entry.name}/`);
                    if (currentDepth < depth)
                        walk(node_path_1.default.join(dir, entry.name), currentDepth + 1, prefix + "  ");
                }
                else {
                    let size = 0;
                    try {
                        size = node_fs_1.default.statSync(node_path_1.default.join(dir, entry.name)).size;
                    }
                    catch {
                        // ignore
                    }
                    lines.push(`${prefix}${entry.name}${size ? ` (${formatBytes(size)})` : ""}`);
                }
            }
        };
        walk(root, 1, "");
        return (0, types_1.textResult)(`${(0, fs_1.relativeTo)(context.cwd, root)}/\n${lines.join("\n") || "(empty)"}`);
    },
};
const globTool = {
    name: "glob",
    description: "Find files by glob pattern (e.g. **/*.ts, src/**/test*.js). Returns paths relative to the project.",
    readOnly: true,
    parameters: {
        type: "object",
        properties: {
            pattern: { type: "string", description: "Glob pattern." },
            path: { type: "string", description: "Root directory. Default project root." },
            limit: { type: "number", description: "Maximum results (default 200)." },
        },
        required: ["pattern"],
    },
    async run(args, context) {
        const pattern = (0, types_1.stringArg)(args, "pattern");
        if (!pattern)
            return (0, types_1.errorResult)("pattern is required.");
        const root = resolveToolPath(context.cwd, (0, types_1.stringArg)(args, "path", "."));
        const limit = Math.max(1, Math.min(2000, (0, types_1.numberArg)(args, "limit", 200)));
        const files = (0, fs_1.walkFiles)(root, { maxFiles: 50000 });
        const matches = [];
        const hasSlash = pattern.includes("/");
        for (const file of files) {
            const rel = node_path_1.default.relative(root, file).split(node_path_1.default.sep).join("/");
            const target = hasSlash ? rel : node_path_1.default.basename(rel);
            if ((0, glob_1.matchesGlob)(pattern, target)) {
                matches.push((0, fs_1.relativeTo)(context.cwd, file));
                if (matches.length >= limit)
                    break;
            }
        }
        matches.sort();
        return (0, types_1.textResult)(matches.length ? matches.join("\n") : `No files matched ${pattern}`);
    },
};
const grepTool = {
    name: "grep",
    description: "Search file contents with a regular expression. Returns path:line: text. Skips binary files and large files.",
    readOnly: true,
    parameters: {
        type: "object",
        properties: {
            pattern: { type: "string", description: "Regular expression." },
            path: { type: "string", description: "Root directory or file. Default project root." },
            include: { type: "string", description: "Optional glob filter for filenames, e.g. *.ts." },
            caseSensitive: { type: "boolean", description: "Case sensitive (default false)." },
            maxResults: { type: "number", description: "Maximum matches (default 100)." },
        },
        required: ["pattern"],
    },
    async run(args, context) {
        const patternText = (0, types_1.stringArg)(args, "pattern");
        if (!patternText)
            return (0, types_1.errorResult)("pattern is required.");
        const caseSensitive = (0, types_1.booleanArg)(args, "caseSensitive", false);
        let regex;
        try {
            regex = new RegExp(patternText, caseSensitive ? "" : "i");
        }
        catch (error) {
            return (0, types_1.errorResult)(`Invalid regular expression: ${error.message}`);
        }
        const root = resolveToolPath(context.cwd, (0, types_1.stringArg)(args, "path", "."));
        const include = (0, types_1.stringArg)(args, "include", "");
        const maxResults = Math.max(1, Math.min(1000, (0, types_1.numberArg)(args, "maxResults", 100)));
        const files = [];
        const stat = node_fs_1.default.statSync(root);
        if (stat.isFile())
            files.push(root);
        else
            files.push(...(0, fs_1.walkFiles)(root, { maxFiles: 50000 }).filter((file) => !include || (0, glob_1.matchesGlob)(include, node_path_1.default.basename(file))));
        const results = [];
        for (const file of files) {
            if (results.length >= maxResults)
                break;
            let buffer;
            try {
                const fileStat = node_fs_1.default.statSync(file);
                if (fileStat.size > 1_500_000)
                    continue;
                buffer = node_fs_1.default.readFileSync(file);
            }
            catch {
                continue;
            }
            if ((0, fs_1.isBinary)(buffer))
                continue;
            const lines = buffer.toString("utf8").split("\n");
            for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i])) {
                    results.push(`${(0, fs_1.relativeTo)(context.cwd, file)}:${i + 1}: ${lines[i].slice(0, 300)}`);
                    if (results.length >= maxResults)
                        break;
                }
            }
        }
        return (0, types_1.textResult)(results.length ? results.join("\n") : `No matches for ${patternText}`);
    },
};
function countOccurrences(haystack, needle) {
    if (!needle)
        return 0;
    return haystack.split(needle).length - 1;
}
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes}B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
exports.fsTools = [readTool, writeTool, editTool, multiEditTool, listTool, globTool, grepTool];
//# sourceMappingURL=fs-tools.js.map