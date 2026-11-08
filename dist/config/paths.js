"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalXminalDir = globalXminalDir;
exports.globalConfigPath = globalConfigPath;
exports.globalMemoryDir = globalMemoryDir;
exports.projectXminalDir = projectXminalDir;
exports.projectConfigPath = projectConfigPath;
exports.projectSessionsDir = projectSessionsDir;
exports.projectMemoryDir = projectMemoryDir;
exports.projectCheckpointsDir = projectCheckpointsDir;
exports.projectReceiptsDir = projectReceiptsDir;
exports.projectTodosPath = projectTodosPath;
exports.projectSkillsDir = projectSkillsDir;
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
function globalXminalDir() {
    return node_path_1.default.join(node_os_1.default.homedir(), ".xminal");
}
function globalConfigPath() {
    return node_path_1.default.join(globalXminalDir(), "config.json");
}
function globalMemoryDir() {
    return node_path_1.default.join(globalXminalDir(), "memory");
}
function projectXminalDir(cwd) {
    return node_path_1.default.join(cwd, ".xminal");
}
function projectConfigPath(cwd) {
    return node_path_1.default.join(projectXminalDir(cwd), "config.json");
}
function projectSessionsDir(cwd) {
    return node_path_1.default.join(projectXminalDir(cwd), "sessions");
}
function projectMemoryDir(cwd) {
    return node_path_1.default.join(projectXminalDir(cwd), "memory");
}
function projectCheckpointsDir(cwd) {
    return node_path_1.default.join(projectXminalDir(cwd), "checkpoints");
}
function projectReceiptsDir(cwd) {
    return node_path_1.default.join(projectXminalDir(cwd), "receipts");
}
function projectTodosPath(cwd) {
    return node_path_1.default.join(projectXminalDir(cwd), "todos.json");
}
function projectSkillsDir(cwd) {
    return node_path_1.default.join(projectXminalDir(cwd), "skills");
}
//# sourceMappingURL=paths.js.map