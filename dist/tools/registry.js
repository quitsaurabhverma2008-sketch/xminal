"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
const types_1 = require("./types");
class ToolRegistry {
    tools = new Map();
    register(tool) {
        this.tools.set(tool.name, tool);
    }
    registerAll(tools) {
        for (const tool of tools)
            this.register(tool);
    }
    get(name) {
        return this.tools.get(name);
    }
    names() {
        return [...this.tools.keys()].sort();
    }
    defs(readOnlyOnly = false) {
        return [...this.tools.values()]
            .filter((tool) => !readOnlyOnly || tool.readOnly)
            .map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
            readOnly: tool.readOnly,
        }));
    }
    async execute(name, args, context) {
        const tool = this.tools.get(name);
        if (!tool)
            return (0, types_1.errorResult)(`Unknown tool: ${name}`);
        const decision = await context.permissions.check(name, args);
        if (!decision.allowed) {
            return (0, types_1.errorResult)(`Permission denied (${decision.reason}). User did not approve this action.`);
        }
        try {
            return await tool.run(args, context);
        }
        catch (error) {
            return (0, types_1.errorResult)(error instanceof Error ? error.message : String(error));
        }
    }
}
exports.ToolRegistry = ToolRegistry;
//# sourceMappingURL=registry.js.map