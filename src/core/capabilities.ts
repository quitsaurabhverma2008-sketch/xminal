/**
 * Capability awareness — the model should know what it can do BEFORE it is
 * asked. This module renders the three things XMINAL can reach:
 *
 *   1. tools (the ToolRegistry, via defs)
 *   2. MCP servers (configured; status resolved async by the `capabilities` tool)
 *   3. skills (ranked against the current request)
 *
 * The prompt path uses a cheap SYNC summary (no network, no MCP spawn). The
 * `capabilities` tool runs the full async snapshot on demand.
 */

export interface CapabilityToolDef {
  readonly name: string;
  readonly description?: string;
  readonly readOnly?: boolean;
}

export interface CapabilitySnapshot {
  readonly tools: readonly CapabilityToolDef[];
  /** configured MCP servers, in config order — no network calls */
  readonly mcpServers: readonly string[];
  /** skills ranked for the current request */
  readonly relevantSkills: readonly string[];
}

/** One line per tool: name + read-only marker + the first sentence. */
export function renderToolList(tools: readonly CapabilityToolDef[]): string {
  return tools
    .map((tool) => {
      const firstSentence = (tool.description ?? "").split(/(?<=[.!?])\s/)[0]?.trim() ?? "";
      const marker = tool.readOnly ? " (read-only)" : "";
      return `${tool.name}${marker} — ${firstSentence}`;
    })
    .join("\n");
}

/**
 * The sync block that goes into the system prompt every turn. It is short by
 * design: tool names + one-line purposes, configured MCP server names, and
 * the skills most relevant right now. No counts that would lie on a resume.
 */
export function renderCapabilitySummary(
  snapshot: CapabilitySnapshot,
  options: { maxTools?: number } = {},
): string {
  const maxTools = options.maxTools ?? 40;
  const tools = snapshot.tools.slice(0, maxTools);
  const lines: string[] = ["<CAPABILITIES>"];
  lines.push("Tools:");
  lines.push(
    renderToolList(tools),
    snapshot.tools.length > tools.length ? `… and ${snapshot.tools.length - tools.length} more` : "",
  );
  if (snapshot.mcpServers.length) {
    lines.push(`MCP servers configured: ${snapshot.mcpServers.join(", ")} — use the mcp_* tools; if one looks dead, call \`capabilities\` for its status.`);
  } else {
    lines.push("MCP servers: none configured — `mcp_search <query>` finds public ones; `mcp_add` configures one.");
  }
  if (snapshot.relevantSkills.length) {
    lines.push(`Skills for this request: ${snapshot.relevantSkills.join(", ")} — load one with the skill tool before you act.`);
  }
  lines.push("</CAPABILITIES>");
  return lines.filter(Boolean).join("\n");
}

export interface McpStatusLine {
  readonly name: string;
  readonly status: "ok" | "error" | "disabled";
  readonly toolCount: number;
  readonly error?: string;
}

/** Render MCP status for the `capabilities` tool (async path). */
export function renderMcpStatus(statuses: readonly McpStatusLine[]): string {
  if (statuses.length === 0) return "MCP servers: none configured.";
  return statuses
    .map((s) => {
      if (s.status === "disabled") return `- ${s.name}: disabled`;
      if (s.status === "error") return `- ${s.name}: FAILED — ${s.error ?? "unknown error"} (fix the config or remove it)`;
      return `- ${s.name}: ok — ${s.toolCount} tool${s.toolCount === 1 ? "" : "s"} visible`;
    })
    .join("\n");
}
