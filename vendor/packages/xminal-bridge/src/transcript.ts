/**
 * Project XMINAL's ChatMessage transcript into OpenCode's SessionMessageInfo
 * wire format. Rebuilt on every read — ids are deterministic so the client's
 * store reconciles rows instead of duplicating them.
 */
export interface TokenUsageInfo {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

export interface ModelRef {
  id: string
  providerID: string
  variant?: string
}

export interface WireUserMessage {
  id: string
  type: "user"
  text: string
  time: { created: number }
  metadata?: Record<string, unknown>
}

export interface WireToolStateCompleted {
  status: "completed"
  input: Record<string, unknown>
  content: Array<{ type: "text"; text: string }>
  metadata?: Record<string, unknown>
}

export interface WireToolStateError {
  status: "error"
  input: Record<string, unknown>
  error: { type: string; message: string }
  content?: Array<{ type: "text"; text: string }>
}

export interface WireAssistantMessage {
  id: string
  type: "assistant"
  agent: string
  model: ModelRef
  content: Array<
    | { type: "text"; text: string; time: { created: number } }
    | {
        type: "tool"
        id: string
        name: string
        state: WireToolStateCompleted | WireToolStateError
        time: { created: number; completed: number }
      }
  >
  time: { created: number; completed?: number }
  finish?: "stop" | "length" | "tool-calls" | "error" | "unknown"
  tokens?: TokenUsageInfo
  cost?: number
}

export function modelRef(spec: string | undefined): ModelRef {
  const s = spec ?? "opencode/inkling-2-small-free"
  const slash = s.indexOf("/")
  if (slash > 0) return { id: s.slice(slash + 1), providerID: s.slice(0, slash) }
  return { id: s, providerID: "opencode" }
}

function parseInput(argumentsJson: string | undefined): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(argumentsJson ?? "{}")
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export interface SessionLike {
  readonly id: string
  readonly meta: { createdAt?: string; updatedAt?: string; title?: string }
  readonly messages: Array<{
    role: string
    content?: string
    toolCalls?: Array<{ id: string; name: string; arguments?: string }>
    toolCallId?: string
    name?: string
  }>
}

export function projectTranscript(
  session: SessionLike,
  options: { model?: string; agent?: string; created?: number } = {},
): Array<WireUserMessage | WireAssistantMessage> {
  const out: Array<WireUserMessage | WireAssistantMessage> = []
  // pair tool results to their call ids before walking assistant rows
  const results = new Map<string, string>()
  for (const msg of session.messages) {
    if (msg.role === "tool" && msg.toolCallId) results.set(msg.toolCallId, String(msg.content ?? ""))
  }
  let seq = 0
  const created = options.created ?? (Date.parse(session.meta.createdAt ?? new Date(0).toISOString()) || 0)
  const agent = options.agent ?? "build"
  const model = modelRef(options.model)
  for (const msg of session.messages) {
    if (msg.role === "user") {
      out.push({
        id: `msg_${session.id}_${seq++}`,
        type: "user",
        text: String(msg.content ?? ""),
        time: { created: created + seq },
      })
      continue
    }
    if (msg.role !== "assistant") continue
    const content: WireAssistantMessage["content"] = []
    if (msg.content && msg.content.length > 0) {
      content.push({ type: "text", text: msg.content, time: { created: created + seq + 1 } })
    }
    for (const tool of msg.toolCalls ?? []) {
      const resultText = results.get(tool.id)
      const isError = resultText !== undefined && /^(error|fail|timeout|aborted|denied|blocked)/i.test(resultText.trim())
      const input = parseInput(tool.arguments)
      if (resultText === undefined) {
        // call recorded without a result — surface honestly as running… final state unknown
        continue
      }
      content.push({
        type: "tool",
        id: tool.id,
        name: tool.name,
        state: isError
          ? {
              status: "error",
              input,
              error: { type: "unknown", message: resultText.split("\n")[0] ?? "tool failed" },
              content: [{ type: "text", text: resultText }],
            }
          : { status: "completed", input, content: [{ type: "text", text: resultText }] },
        time: { created: created + seq + 1, completed: created + seq + 1 },
      })
    }
    if (content.length === 0 && !msg.toolCalls?.length) continue
    out.push({
      id: `msg_${session.id}_${seq++}`,
      type: "assistant",
      agent, // one agent per turn is enough fidelity for now
      model,
      content,
      time: { created: created + seq, completed: created + seq },
      finish: "stop",
    })
  }
  return out
}
