"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadTodos = loadTodos;
exports.detectGitBranch = detectGitBranch;
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const paths_1 = require("../config/paths");
const fs_1 = require("../util/fs");
function loadTodos(cwd) {
    try {
        const items = (0, fs_1.readJson)((0, paths_1.projectTodosPath)(cwd), []);
        return Array.isArray(items) ? items : [];
    }
    catch {
        return [];
    }
}
function detectGitBranch(cwd) {
    try {
        const head = node_path_1.default.join(cwd, ".git", "HEAD");
        if (!node_fs_1.default.existsSync(head))
            return undefined;
        const content = node_fs_1.default.readFileSync(head, "utf8").trim();
        const match = content.match(/^ref:\s*refs\/heads\/(.+)$/);
        return match ? match[1] : undefined;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=state.js.map