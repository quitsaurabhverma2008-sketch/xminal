import type { ToolDef } from "../providers/types";
import type { Tool, ToolContext, ToolResult } from "./types";
import { errorResult } from "./types";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: Tool[]): void {
    for (const tool of tools) this.register(tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  names(): string[] {
    return [...this.tools.keys()].sort();
  }

  defs(readOnlyOnly = false): ToolDef[] {
    return [...this.tools.values()]
      .filter((tool) => !readOnlyOnly || tool.readOnly)
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        readOnly: tool.readOnly,
      }));
  }

  async execute(name: string, args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return errorResult(`Unknown tool: ${name}`);
    const decision = await context.permissions.check(name, args);
    if (!decision.allowed) {
      return errorResult(`Permission denied (${decision.reason}). User did not approve this action.`);
    }
    try {
      return await tool.run(args, context);
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : String(error));
    }
  }
}
