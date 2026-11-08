"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allTools = allTools;
const fs_tools_1 = require("./fs-tools");
const bash_tool_1 = require("./bash-tool");
const todo_tool_1 = require("./todo-tool");
const memory_tool_1 = require("./memory-tool");
const skill_tool_1 = require("./skill-tool");
const checkpoint_tool_1 = require("./checkpoint-tool");
const git_tool_1 = require("./git-tool");
const worktree_tool_1 = require("./worktree-tool");
const verify_tool_1 = require("./verify-tool");
const web_tool_1 = require("./web-tool");
const diagnostics_tool_1 = require("./diagnostics-tool");
const mcp_tool_1 = require("./mcp-tool");
const agent_tools_1 = require("./agent-tools");
function allTools() {
    return [
        ...fs_tools_1.fsTools,
        ...bash_tool_1.bashTools,
        ...todo_tool_1.todoTools,
        ...memory_tool_1.memoryTools,
        ...skill_tool_1.skillTools,
        ...checkpoint_tool_1.checkpointTools,
        ...git_tool_1.gitTools,
        ...worktree_tool_1.worktreeTools,
        ...verify_tool_1.verifyTools,
        ...web_tool_1.webTools,
        ...diagnostics_tool_1.diagnosticsTools,
        ...mcp_tool_1.mcpTools,
        ...agent_tools_1.agentTools,
    ];
}
//# sourceMappingURL=index.js.map