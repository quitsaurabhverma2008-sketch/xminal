"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateTokens = estimateTokens;
exports.usageFile = usageFile;
exports.recordToolUsage = recordToolUsage;
exports.loadToolUsage = loadToolUsage;
exports.formatTokens = formatTokens;
const node_path_1 = __importDefault(require("node:path"));
const fs_1 = require("../util/fs");
const paths_1 = require("../config/paths");
function estimateTokens(text) {
    if (!text)
        return 0;
    return Math.ceil(text.length / 4);
}
function usageFile(cwd) {
    return node_path_1.default.join((0, paths_1.projectReceiptsDir)(cwd), "tool-usage.jsonl");
}
function recordToolUsage(cwd, entry) {
    const record = {
        ts: new Date().toISOString(),
        totalTokens: entry.argTokens + entry.resultTokens,
        ...entry,
    };
    try {
        (0, fs_1.appendLine)(usageFile(cwd), JSON.stringify(record));
    }
    catch {
        // usage tracking must never break the agent
    }
}
function loadToolUsage(cwd) {
    let content = "";
    try {
        content = (0, fs_1.readText)(usageFile(cwd));
    }
    catch {
        return { entries: 0, totalCalls: 0, totalTokens: 0, totalErrors: 0, byTool: [] };
    }
    const buckets = new Map();
    let entries = 0;
    let totalTokens = 0;
    let totalErrors = 0;
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        let record;
        try {
            record = JSON.parse(trimmed);
        }
        catch {
            continue;
        }
        entries += 1;
        totalTokens += record.totalTokens ?? 0;
        if (record.isError)
            totalErrors += 1;
        const key = record.server + ":" + (record.detail ?? record.tool);
        const existing = buckets.get(key);
        if (existing) {
            existing.calls += 1;
            existing.tokens += record.totalTokens ?? 0;
            if (record.isError)
                existing.errors += 1;
        }
        else {
            buckets.set(key, {
                name: record.detail ? `${record.server}/${record.detail}` : `${record.server}/${record.tool}`,
                server: record.server,
                tool: record.tool,
                detail: record.detail,
                calls: 1,
                tokens: record.totalTokens ?? 0,
                errors: record.isError ? 1 : 0,
            });
        }
    }
    const byTool = [...buckets.values()].sort((a, b) => b.tokens - a.tokens);
    return { entries, totalCalls: entries, totalTokens, totalErrors, byTool };
}
function formatTokens(count) {
    if (count >= 1_000_000)
        return `${(count / 1_000_000).toFixed(2)}M`;
    if (count >= 1_000)
        return `${(count / 1_000).toFixed(1)}k`;
    return String(count);
}
//# sourceMappingURL=tool-usage.js.map