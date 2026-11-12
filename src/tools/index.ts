import type { Tool } from "./types";
import { fsTools } from "./fs-tools";
import { bashTools } from "./bash-tool";
import { todoTools } from "./todo-tool";
import { memoryTools } from "./memory-tool";
import { skillTools } from "./skill-tool";
import { checkpointTools } from "./checkpoint-tool";
import { gitTools } from "./git-tool";
import { worktreeTools } from "./worktree-tool";
import { verifyTools } from "./verify-tool";
import { webTools } from "./web-tool";
import { diagnosticsTools } from "./diagnostics-tool";
import { mcpTools } from "./mcp-tool";
import { agentTools } from "./agent-tools";
import { capabilityTools } from "./capability-tool";
import { skillRegistryTools } from "./skill-registry-tool";

export function allTools(): Tool[] {
  return [
    ...fsTools,
    ...bashTools,
    ...todoTools,
    ...memoryTools,
    ...skillTools,
    ...checkpointTools,
    ...gitTools,
    ...worktreeTools,
    ...verifyTools,
    ...webTools,
    ...diagnosticsTools,
    ...mcpTools,
    ...agentTools,
    ...capabilityTools,
    ...skillRegistryTools,
  ];
}
