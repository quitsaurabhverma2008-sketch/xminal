"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAudit = verifyAudit;
exports.tailAudit = tailAudit;
const node_path_1 = __importDefault(require("node:path"));
const paths_1 = require("../config/paths");
const permissions_1 = require("../core/permissions");
const fs_1 = require("../util/fs");
function verifyAudit(cwd) {
    return permissions_1.AuditLog.verifyFile(node_path_1.default.join((0, paths_1.projectReceiptsDir)(cwd), "audit.jsonl"));
}
function tailAudit(cwd, count = 10) {
    const file = node_path_1.default.join((0, paths_1.projectReceiptsDir)(cwd), "audit.jsonl");
    let content = "";
    try {
        content = (0, fs_1.readText)(file);
    }
    catch {
        return [];
    }
    const entries = [];
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        try {
            entries.push(JSON.parse(trimmed));
        }
        catch {
            // skip malformed
        }
    }
    return entries.slice(-Math.max(1, count));
}
//# sourceMappingURL=audit.js.map