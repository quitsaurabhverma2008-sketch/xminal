import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { EventBus, type WireEvent } from "./bus"
import { loadXminal, type Xminal } from "./xminal"
import { modelRef, projectTranscript, type SessionLike } from "./transcript"

/* ─── state ─────────────────────────────────────────────────────────── */

interface SessionState {
  runtime: any
  readonly projectID: string
  seq: number
  assistantMessageID?: string
  textPartID?: string
  reasoningPartID?: string
  /** tool call id → part ordinal for live tool parts */
  readonly toolParts: Map<string, number>
  /** inbox ids for dedupe with the frontend outbox */
  readonly pendingInboxIds: Set<string>
  readonly controller: AbortController
  cost: number
  inputTokens: number
  outputTokens: number
  busy: boolean
}

const busSingleton = new EventBus()
const sessions = new Map<string, SessionState>()
const pendingRequests = new Map<string, { resolve: (allow: boolean) => void; state: SessionState }>()

export function getBus(): EventBus {
  return busSingleton
}

function projectIDFor(cwd: string): string {
  return "proj_" + crypto.createHash("sha256").update(cwd).digest("hex").slice(0, 16)
}

function sessionAgent(runtime: any): string {
  return "build"
}

async function sessionState(cwd: string, sessionId: string, xminal: Xminal): Promise<SessionState | undefined> {
  const existing = sessions.get(sessionId)
  if (existing) return existing
  let session: any
  try {
    session = xminal.Session.load(cwd, sessionId)
  } catch {
    return undefined
  }
  const state: SessionState = {
    runtime: undefined as any,
    projectID: projectIDFor(cwd),
    seq: 0,
    toolParts: new Map(),
    pendingInboxIds: new Set(),
    controller: new AbortController(),
    cost: 0,
    inputTokens: 0,
    outputTokens: 0,
    busy: false,
  }
  state.runtime = createRuntime(xminal, cwd, session, state)
  sessions.set(sessionId, state)
  return state
}

function nextAssistantMessageID(state: SessionState): string {
  state.assistantMessageID = `msg_${++state.seq}_${Date.now().toString(36)}`
  state.textPartID = undefined
  state.reasoningPartID = undefined
  return state.assistantMessageID
}

function emitInboxEnqueued(
  bus: EventBus,
  state: SessionState,
  cwd: string,
  id: string,
  payload: Record<string, unknown>,
) {
  bus.emit("session.inbox.enqueued", {
    sessionID: state.runtime.session.id,
    inboxID: id,
    item: {
      id,
      sessionID: state.runtime.session.id,
      time: { created: Date.now() },
      type: "user",
      delivery: "steer",
      payload,
    },
  }, cwd)
}

function createRuntime(xminal: Xminal, cwd: string, session: any, state: SessionState): any {
  const bus = getBus()
  const callbacks = {
    onText: (chunk: string) => {
      if (!state.textPartID) {
        state.textPartID = `part_text_${state.seq}_1`
        bus.emit("session.text.started", {
          sessionID: session.id,
          assistantMessageID: state.assistantMessageID,
          id: state.textPartID,
          ordinals: undefined,
        }, cwd)
      }
      bus.emit("session.text.delta", {
        sessionID: session.id,
        assistantMessageID: state.assistantMessageID,
        id: state.textPartID,
        ordinal: 0,
        delta: chunk,
      }, cwd)
    },
    onReasoning: (chunk: string) => {
      if (!state.reasoningPartID) {
        state.reasoningPartID = `part_reasoning_${state.seq}_1`
        bus.emit("session.reasoning.started", {
          sessionID: session.id,
          assistantMessageID: state.assistantMessageID,
          id: state.reasoningPartID,
        }, cwd)
      }
      bus.emit("session.reasoning.delta", {
        sessionID: session.id,
        assistantMessageID: state.assistantMessageID,
        id: state.reasoningPartID,
        ordinal: 0,
        delta: chunk,
      }, cwd)
    },
    onToolCall: (call: { id: string; name: string; arguments?: string }) => {
      const partId = `part_tool_${state.seq}_${++state.seq}`
      state.toolParts.set(call.id, state.seq)
      bus.emit("session.tool.input.started", {
        sessionID: session.id,
        assistantMessageID: state.assistantMessageID,
        id: call.id,
        name: call.name,
      }, cwd)
      bus.emit("session.tool.called", {
        sessionID: session.id,
        assistantMessageID: state.assistantMessageID,
        id: call.id,
        input: parseJson(call.arguments),
        executed: false,
      }, cwd)
    },
    onToolResult: (_name: string, result: { isError?: boolean; content?: string }) => {
      // find the most recent pending tool call by reading the runtime history? Not exposed —
      // fall back to marking every unfinished tool the frontend already knows about.
      const lastId = [...state.toolParts.keys()].pop()
      if (!lastId) return
      const isError = Boolean(result.isError)
      const content = String(result.content ?? "")
      const text = content.split("\n")[0] ?? ""
      const evt = isError ? "session.tool.failed" : "session.tool.success"
      bus.emit(evt, {
        sessionID: session.id,
        assistantMessageID: state.assistantMessageID,
        id: lastId,
        ...(isError
          ? { error: { type: "unknown", message: text.slice(0, 200) }, executed: true, content: [{ type: "text", text }] }
          : { metadata: {}, executed: true, content: [{ type: "text", text }] }),
      }, cwd)
    },
    onStatus: (_message: string) => {
      // transient status lines are surfaced through the same tool/progress lane
      bus.emit("session.tool.progress", {
        sessionID: session.id,
        assistantMessageID: state.assistantMessageID,
        id: "status",
        metadata: { message: String(_message) },
      }, cwd)
    },
    onUsage: (usage: { inputTokens?: number; outputTokens?: number }) => {
      // xminal reports cumulative totals per event — adopt them, never add
      if (usage.inputTokens !== undefined) state.inputTokens = Math.max(state.inputTokens, usage.inputTokens)
      if (usage.outputTokens !== undefined) state.outputTokens = Math.max(state.outputTokens, usage.outputTokens)
      bus.emit("session.usage.updated", {
        sessionID: session.id,
        usage: {
          inputTokens: state.inputTokens,
          outputTokens: state.outputTokens,
          totalTokens: state.inputTokens + state.outputTokens,
          reasoningTokens: 0,
          cost: state.cost,
        },
      }, cwd)
    },
  }
  const runtime = new xminal.Runtime(cwd, {
    mode: "build",
    model: session.meta?.model,
    sessionId: session.id,
    callbacks,
  })
  // XMINAL's permission callback → opencode permission.* events
  runtime.setAskHandler((tool: string, reason?: string) =>
    new Promise<boolean>((resolve) => {
      const id = `perm_${Date.now().toString(36)}_${++state.seq}`
      pendingRequests.set(id, { resolve, state })
      bus.emit("permission.asked", {
        id,
        sessionID: session.id,
        action: tool,
        resources: ["*"],
        message: reason ?? undefined,
        metadata: { tool, reason: reason ?? null },
        source: { type: "tool", messageID: state.assistantMessageID ?? "unknown", id },
      }, cwd)
    }),
  )
  return runtime
}

function parseJson(text: string | undefined): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text ?? "{}")
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return { raw: text }
  }
}

/* ─── responses ─────────────────────────────────────────────────────── */

function send(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function noContent(): Response {
  return new Response(null, { status: 204 })
}

function declaredError(tag: string, message: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ _tag: tag, message, ...extra }), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function sessionInfo(cwd: string, session: any, state?: SessionState): Record<string, unknown> {
  const meta = session.meta ?? {}
  const created = Date.parse(meta.createdAt ?? "") || Date.now()
  const updated = Date.parse(meta.updatedAt ?? "") || created
  return {
    id: session.id,
    projectID: state?.projectID ?? projectIDFor(cwd),
    agent: "build",
    model: modelRef(meta.model),
    cost: state?.cost ?? 0,
    tokens: {
      input: state?.inputTokens ?? 0,
      output: state?.outputTokens ?? 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    time: { created, updated, busy: state?.busy ? Date.now() : undefined, idle: state?.busy ? undefined : updated },
    title: meta.title,
    location: { directory: cwd },
  }
}

function locationRef(cwd: string) {
  return { directory: cwd }
}

/* ─── fetch router ──────────────────────────────────────────────────── */

type Route = {
  readonly method: string
  readonly match: (segs: string[]) => Record<string, string> | undefined
  readonly handler: (ctx: RouteContext) => Promise<Response> | Response
}

interface RouteContext {
  readonly cwd: string
  readonly xminal: Xminal
  readonly url: URL
  readonly method: string
  readonly params: Record<string, string>
  readonly body: unknown
  readonly directory: string
}

const routes: Route[] = []

function route(method: string, pattern: string, handler: Route["handler"]) {
  const segs = pattern.split("/").filter(Boolean)
  const fixed: Array<{ i: number; v: string }> = []
  const params: Array<{ i: number; name: string }> = []
  segs.forEach((seg, i) => {
    if (seg.startsWith(":")) params.push({ i, name: seg.slice(1) })
    else fixed.push({ i, v: seg })
  })
  routes.push({
    method,
    match: (parts) => {
      if (parts.length !== segs.length) return undefined
      for (const { i, v } of fixed) if (parts[i] !== v) return undefined
      const out: Record<string, string> = {}
      for (const { i, name } of params) {
        try {
          out[name] = decodeURIComponent(parts[i])
        } catch {
          out[name] = parts[i]
        }
      }
      return out
    },
    handler,
  })
}

async function jsonBody(request: Request): Promise<unknown> {
  const text = await request.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

export async function handleOpenCodeRequest(request: Request, cwd: string): Promise<Response> {
  const xminal = await loadXminal()
  const url = new URL(request.url)
  // strip the leading slash and split; the API always starts with /api
  const parts = url.pathname.split("/").filter(Boolean).map((s) => s)
  if (parts[0] !== "api") {
    return declaredError("UnknownError", `unknown route ${url.pathname}`, 404)
  }
  const segments = parts.slice(1)

  if (url.pathname === "/api/event") return streamEvents(request, cwd)

  for (const r of routes) {
    if (r.method !== request.method) continue
    const params = r.match(segments)
    if (!params) continue
    try {
      return await r.handler({ cwd, xminal, url, method: request.method, params, body: await jsonBody(request), directory: cwd })
    } catch (error) {
      return declaredError("UnknownError", error instanceof Error ? error.message : String(error), 500)
    }
  }
  return declaredError("UnknownError", `not implemented: ${request.method} ${url.pathname}`, 501)
}

function streamEvents(request: Request, cwd: string): Response {
  const bus = getBus()
  const signal = request.signal
  const encoder = new TextEncoder()
  const iterator = bus.stream(signal, cwd)[Symbol.asyncIterator]()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const result = await iterator.next()
      if (result.done) {
        controller.close()
        return
      }
      const data = `data: ${JSON.stringify(result.value)}\n\n`
      controller.enqueue(encoder.encode(data))
    },
    cancel(reason) {
      signal?.reason // keep signal ref; nothing else to cancel
    },
  })
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  })
}

/* ─── concrete handlers ─────────────────────────────────────────────── */

route("GET", "location", ({ cwd }) =>
  send({
    directory: cwd,
    project: { id: projectIDFor(cwd), directory: cwd, canonical: cwd },
  }),
)
route("POST", "location/reload", () => noContent())
route("GET", "info", () =>
  send({
    version: "xminal-bridge",
    package: { name: "xminal", version: "0.10.0" },
    project: { id: "xminal", name: "XMINAL" },
  }),
)
route("GET", "file/list", ({ cwd }) => send({ location: locationRef(cwd), data: [] }))
route("GET", "file/find", ({ cwd }) => send({ location: locationRef(cwd), data: [] }))

/* ─── sessions ──────────────────────────────────────────────────────── */

route("GET", "session", async ({ cwd, xminal, url }) => {
  const metas = xminal.Session.list(cwd)
  const search = (url.searchParams.get("search") ?? "").toLowerCase()
  const limitRaw = Number(url.searchParams.get("limit") ?? "50")
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(200, Math.floor(limitRaw)) : 50
  const filtered = metas
    .filter((m: any) => !search || String(m.title ?? "").toLowerCase().includes(search) || String(m.id).toLowerCase().includes(search))
    .slice(0, limit)
  const data: unknown[] = []
  for (const meta of filtered) {
    let state = sessions.get(meta.id)
    let session: any
    try {
      session = xminal.Session.load(cwd, meta.id)
    } catch {
      continue
    }
    if (!state) state = undefined
    data.push(sessionInfo(cwd, session, state))
  }
  return send({ data, cursor: { previous: null, next: null } })
})
route("POST", "session", async ({ cwd, xminal, body }) => {
  const b = (body ?? {}) as Record<string, any>
  const xminalBody = b as { title?: string; model?: { id?: string; providerID?: string }; agent?: string }
  const spec = xminalBody.model ? `${xminalBody.model.providerID}/${xminalBody.model.id}` : undefined
  const session = xminal.Session.create(cwd, {
    model: spec ?? "opencode/inkling-2-small-free",
    mode: "auto",
    title: xminalBody.title ?? undefined,
    agentMode: xminalBody.agent ?? "build",
  })
  const state = await sessionState(cwd, session.id, xminal)
  busEmit("session.created", {
    sessionID: session.id,
    slug: session.id,
    projectID: projectIDFor(cwd),
    location: { directory: cwd },
    title: session.meta.title,
    version: "xminal",
  }, cwd)
  return send({ data: sessionInfo(cwd, session, state) })
})
route("GET", "session/active", async ({ cwd }) => {
  const out: Record<string, { type: string }> = {}
  for (const [id, state] of sessions) if (state.busy) out[id] = { type: "running" }
  return send({ data: out })
})

function busEmit(type: string, data: Record<string, unknown>, cwd: string) {
  getBus().emit(type, data, cwd)
}

interface LoadedSession {
  readonly session: any
  readonly state: SessionState
  readonly runtime: any
}
async function loadSession({ cwd, xminal }: RouteContext, id: string): Promise<LoadedSession | undefined> {
  const state = await sessionState(cwd, id, xminal)
  if (!state) return undefined
  let session: any
  try {
    session = xminal.Session.load(cwd, id)
  } catch {
    return undefined
  }
  return { session, state, runtime: state.runtime }
}

route("GET", "session/:sessionID", async (ctx) => {
  const loaded = await loadSession(ctx, ctx.params.sessionID)
  if (!loaded) return declaredError("SessionNotFoundError", `session not found: ${ctx.params.sessionID}`, 404, { sessionID: ctx.params.sessionID })
  return send({ data: sessionInfo(ctx.cwd, loaded.session, loaded.state) })
})
route("DELETE", "session/:sessionID", async (ctx) => {
  // honest: XMINAL has no delete primitive — mark archived via metadata? No fake successes.
  return declaredError("UnknownError", "deleting sessions is not implemented in xminal 0.10.0", 501)
})
route("PATCH", "session/:sessionID", async ({ cwd, xminal, params, body }) => {
  const b = (body ?? {}) as { title?: string }
  if (b.title !== undefined) {
    try {
      xminal.Session.load(cwd, params.sessionID) // ensure exists
    } catch {
      return declaredError("SessionNotFoundError", "session not found", 404, { sessionID: params.sessionID })
    }
    // XMINAL has no rename — surface honestly rather than fake it
    return declaredError("UnknownError", "renaming sessions is not implemented in xminal 0.10.0", 501)
  }
  return declaredError("UnknownError", "unsupported session update", 501)
})
route("POST", "session/:sessionID/agent", async (ctx) => {
  const b = (ctx.body ?? {}) as { agent?: string }
  const loaded = await loadSession(ctx, ctx.params.sessionID)
  if (!loaded) return declaredError("SessionNotFoundError", "session not found", 404, { sessionID: ctx.params.sessionID })
  if (b.agent && ["build", "plan", "compose", "review", "yolo"].includes(b.agent)) {
    loaded.runtime.setMode(b.agent)
    busEmit("session.agent.selected", {
      sessionID: ctx.params.sessionID,
      agent: b.agent,
      previous: undefined,
    }, ctx.cwd)
    return noContent()
  }
  return declaredError("InvalidRequestError", `unknown agent '${b.agent}'`, 400)
})
route("POST", "session/:sessionID/model", async (ctx) => {
  const b = (ctx.body ?? {}) as { model?: { providerID?: string; id?: string } }
  const loaded = await loadSession(ctx, ctx.params.sessionID)
  if (!loaded) return declaredError("SessionNotFoundError", "session not found", 404, { sessionID: ctx.params.sessionID })
  if (b.model?.id && b.model?.providerID) {
    loaded.runtime.agent.setModel(`${b.model.providerID}/${b.model.id}`)
    busEmit("session.model.selected", {
      sessionID: ctx.params.sessionID,
      model: { id: b.model.id, providerID: b.model.providerID },
      previous: undefined,
    }, ctx.cwd)
    return noContent()
  }
  return declaredError("InvalidRequestError", "model.providerID and model.id are required", 400)
})

/* ─── messages ──────────────────────────────────────────────────────── */

route("GET", "session/:sessionID/message", async (ctx) => {
  const loaded = await loadSession(ctx, ctx.params.sessionID)
  if (!loaded) return declaredError("SessionNotFoundError", "session not found", 404, { sessionID: ctx.params.sessionID })
  const messages = projectTranscript(loaded.session as SessionLike, {
    model: loaded.session.meta?.model,
    agent: "build",
    created: Date.parse(loaded.session.meta?.createdAt ?? "") || 0,
  })
  return send({ data: messages, cursor: { previous: null, next: null } })
})
route("GET", "session/:sessionID/message/:messageID", async (ctx) => {
  const loaded = await loadSession(ctx, ctx.params.sessionID)
  if (!loaded) return declaredError("SessionNotFoundError", "session not found", 404, { sessionID: ctx.params.sessionID })
  const messages = projectTranscript(loaded.session as SessionLike, { model: loaded.session.meta?.model, agent: "build" })
  const message = messages.find((m) => m.id === ctx.params.messageID)
  if (!message) return declaredError("MessageNotFoundError", "message not found", 404, { sessionID: ctx.params.sessionID, messageID: ctx.params.messageID })
  return send({ data: message })
})
route("GET", "session/:sessionID/inbox", async () => send({ data: [], cursor: { previous: null, next: null } }))
route("DELETE", "session/:sessionID/inbox/:inboxID", async () => noContent())
route("PATCH", "session/:sessionID/inbox/:inboxID", async () => noContent())

/* ─── prompt / interrupt / permission ───────────────────────────────── */

route("POST", "session/:sessionID/prompt", async (ctx) => {
  const b = (ctx.body ?? {}) as { id?: string; text?: string; files?: unknown[]; agents?: unknown[]; skills?: unknown[]; metadata?: Record<string, unknown>; delivery?: string }
  const loaded = await loadSession(ctx, ctx.params.sessionID)
  if (!loaded) return declaredError("SessionNotFoundError", "session not found", 404, { sessionID: ctx.params.sessionID })
  if (!b.text) return declaredError("InvalidRequestError", "text is required", 400)
  const bus = getBus()
  const inboxID = b.id ?? `inbox_${Date.now().toString(36)}`
  const created = Date.now()
  emitInboxEnqueued(bus, loaded.state, ctx.cwd, inboxID, {
    text: b.text,
    ...(b.files ? { files: b.files } : {}),
    ...(b.agents ? { agents: b.agents } : {}),
    ...(b.skills ? { skills: b.skills } : {}),
    ...(b.metadata ? { metadata: b.metadata } : {}),
  })
  void runPrompt(ctx, loaded, b.text)
  return send({
    data: {
      id: inboxID,
      sessionID: ctx.params.sessionID,
      time: { created },
      type: "user",
      payload: { text: b.text },
      delivery: b.delivery ?? "steer",
    },
  })
})

async function runPrompt(ctx: RouteContext, loaded: LoadedSession, text: string) {
  const { runtime, state } = loaded
  const bus = getBus()
  const cwd = ctx.cwd
  state.busy = true
  nextAssistantMessageID(state)
  const assistantMessageID = state.assistantMessageID!
  const mode = runtime.agent.mode ?? "build"
  const modelSpec: string = runtime.agent.modelSpec ?? "opencode/inkling-2-small-free"
  bus.emit("session.execution.started", {
    sessionID: runtime.session.id,
  }, cwd)
  bus.emit("session.step.started", {
    sessionID: runtime.session.id,
    assistantMessageID,
    agent: mode,
    model: modelRef(modelSpec),
    started: Date.now(),
    snapshot: undefined,
  }, cwd)
  let outcome: "stop" | "error" | "interrupted" = "stop"
  try {
    await runtime.agent.run(text)
  } catch (error) {
    outcome = "error"
    bus.emit("session.step.failed", {
      sessionID: runtime.session.id,
      assistantMessageID,
      error: { type: "unknown", message: error instanceof Error ? error.message : String(error) },
    }, cwd)
  } finally {
    state.busy = false
    const finish = outcome === "stop" ? "stop" : "error"
    bus.emit("session.step.ended", {
      sessionID: runtime.session.id,
      assistantMessageID,
      finish,
      cost: state.cost,
      tokens: {
        input: state.inputTokens,
        output: state.outputTokens,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
    }, cwd)
    bus.emit(outcome === "stop" ? "session.execution.succeeded" : "session.execution.failed", {
      sessionID: runtime.session.id,
    }, cwd)
    state.toolParts.clear()
  }
}

route("POST", "session/:sessionID/interrupt", async (ctx) => {
  const state = sessions.get(ctx.params.sessionID)
  if (!state) return send({ interrupted: false })
  state.controller.abort()
  return send({ interrupted: true })
})
route("POST", "session/:sessionID/background", async () => noContent())
route("POST", "session/:sessionID/command", async () =>
  declaredError("UnknownError", "slash commands over the bridge are not implemented in xminal 0.10.0", 501),
)
route("POST", "session/:sessionID/synthetic", async () => declaredError("UnknownError", "synthetic messages not implemented", 501))
route("POST", "session/:sessionID/fork", async () => declaredError("UnknownError", "forking not implemented", 501))
route("POST", "session/:sessionID/compact", async () => declaredError("UnknownError", "compaction not implemented over the bridge", 501))
route("GET", "session/:sessionID/context", async () => declaredError("UnknownError", "context export not implemented", 501))
route("POST", "session/:sessionID/view", async () => send({ viewed: true }))
route("GET", "session/:sessionID/permission", async (ctx) => {
  const list: unknown[] = []
  for (const [id, pending] of pendingRequests) {
    if (pending.state.runtime?.session?.id === ctx.params.sessionID) {
      list.push({ id, sessionID: ctx.params.sessionID, action: "tool", resources: ["*"] })
    }
  }
  return send({ location: locationRef(ctx.cwd), data: list })
})
route("POST", "session/:sessionID/permission/:requestID/reply", async (ctx) => {
  const b = (ctx.body ?? {}) as { decision?: string }
  const pending = pendingRequests.get(ctx.params.requestID)
  pendingRequests.delete(ctx.params.requestID)
  if (pending) {
    pending.resolve(b.decision !== "reject")
    busEmit("permission.replied", {
      id: ctx.params.requestID,
      sessionID: ctx.params.sessionID,
      decision: b.decision ?? "once",
    }, ctx.cwd)
  }
  return noContent()
})

/* ─── models / providers / agents / commands ────────────────────────── */

route("GET", "model", async ({ cwd, xminal }) => {
  const cfg = xminal.loadConfig(cwd).config
  const models = cfg.models ?? {}
  const data: unknown[] = []
  for (const [alias, m] of Object.entries(models) as [string, any][]) {
    const providerID: string = m.provider ?? "opencode"
    const modelID: string = m.model ?? alias
    const inPrice = Number(m.inputPricePerMTok ?? 0)
    const outPrice = Number(m.outputPricePerMTok ?? 0)
    data.push({
      id: alias,
      modelID,
      providerID,
      name: alias,
      capabilities: { tools: m.capabilities?.includes?.("tools") ?? true, input: ["text"], output: ["text"], temperature: true },
      variants: [],
      time: { released: 0 },
      cost: [{ input: inPrice, output: outPrice, cache: { read: 0, write: 0 } }],
      status: "active",
      enabled: true,
      limit: { context: Number(m.contextWindow ?? 128000), input: Number(m.contextWindow ?? 128000), output: Number(m.maxOutput ?? 16384) },
    })
  }
  return send({ location: locationRef(cwd), data })
})
route("GET", "model/default", async ({ cwd, xminal }) => {
  const cfg = xminal.loadConfig(cwd).config
  const def: string = cfg.defaultModel ?? "opencode/inkling-2-small-free"
  const slash = def.indexOf("/")
  return send({ id: def, providerID: slash > 0 ? def.slice(0, slash) : "opencode", variant: undefined })
})
route("GET", "provider", async ({ cwd, xminal }) => {
  const cfg = xminal.loadConfig(cwd).config
  const names = Object.keys(cfg.providers ?? {})
  const data = names.map((id) => ({
    id,
    name: id,
    activation: "auto",
    package: "xminal",
    capabilities: { models: "*" },
  }))
  return send({ location: locationRef(cwd), data })
})
route("GET", "provider/:providerID", async ({ params, cwd, xminal }) => {
  const cfg = xminal.loadConfig(cwd).config
  if (!cfg.providers?.[params.providerID]) {
    return declaredError("ProviderNotFoundError", "unknown provider", 404, { providerID: params.providerID })
  }
  return send({
    id: params.providerID,
    name: params.providerID,
    activation: "auto",
    package: "xminal",
    capabilities: { models: "*" },
  })
})
route("GET", "agent", async ({ cwd }) =>
  send({
    location: locationRef(cwd),
    data: [
      { id: "build", name: "Build", mode: "primary", hidden: false, color: "#82aaff", permissions: [], request: { settings: {}, headers: {}, body: {} } },
      { id: "plan", name: "Plan", mode: "primary", hidden: false, color: "#ffc777", permissions: [], request: { settings: {}, headers: {}, body: {} } },
      { id: "compose", name: "Compose", mode: "primary", hidden: false, color: "#c099ff", permissions: [], request: { settings: {}, headers: {}, body: {} } },
      { id: "review", name: "Review", mode: "primary", hidden: false, color: "#86e1fc", permissions: [], request: { settings: {}, headers: {}, body: {} } },
      { id: "yolo", name: "Yolo", mode: "primary", hidden: false, color: "#ff757f", permissions: [], request: { settings: {}, headers: {}, body: {} } },
    ],
  }),
)
route("GET", "agent/:agentID", async ({ params }) =>
  send({ id: params.agentID, name: params.agentID, mode: "primary", hidden: false, permissions: [], request: { settings: {}, headers: {}, body: {} } }),
)
route("GET", "command", async ({ cwd }) =>
  send({
    location: locationRef(cwd),
    data: [
      { name: "/help", description: "show commands" },
      { name: "/model", description: "switch model" },
      { name: "/mode", description: "switch plan/build/compose/review/yolo" },
      { name: "/provider", description: "connect a provider" },
      { name: "/compact", description: "compact conversation" },
      { name: "/verify", description: "run tests/build" },
      { name: "/undo", description: "undo last edit" },
      { name: "/docs", description: "show project roadmap" },
      { name: "/exit", description: "quit" },
    ],
  }),
)
route("GET", "reference", async ({ cwd }) => send({ location: locationRef(cwd), data: [] }))
route("GET", "config", async () =>
  send([{ type: "document", info: { $schema: "https://opencode.ai/config.json" } }]),
)
route("GET", "config/shell", async () => send({ data: [] }))
route("GET", "project", async ({ cwd }) =>
  send([{ id: projectIDFor(cwd), canonical: cwd, time: { created: 0, updated: 0 }, sandboxes: [] }]),
)
route("GET", "skill", async ({ cwd }) => send({ location: locationRef(cwd), data: [] }))
route("GET", "websearch/provider", async ({ cwd }) => send({ location: locationRef(cwd), data: [] }))
route("GET", "integration", async ({ cwd }) => send({ location: locationRef(cwd), data: [] }))
route("GET", "mcp", async ({ cwd }) => send({ location: locationRef(cwd), data: [] }))
route("GET", "mcp/resource", async ({ cwd }) => send({ location: locationRef(cwd), data: { server: "", catalog: { resources: [] } } }))

/* ─── vcs ───────────────────────────────────────────────────────────── */

function readBranch(cwd: string): string | undefined {
  try {
    const head = fs.readFileSync(path.join(cwd, ".git", "HEAD"), "utf8").trim()
    const match = head.match(/^ref:\s*refs\/heads\/(.+)$/)
    return match ? match[1] : undefined
  } catch {
    return undefined
  }
}

route("GET", "vcs", async ({ cwd }) => {
  const branch = readBranch(cwd)
  return send({ location: locationRef(cwd), data: { provider: "git", branch: { current: branch, default: "main" } } })
})
route("GET", "vcs/status", async ({ cwd }) => send({ location: locationRef(cwd), data: [] }))
route("GET", "vcs/diff", async ({ cwd }) => send({ location: locationRef(cwd), data: [] }))
route("GET", "vcs/base", async ({ cwd }) => send({ location: locationRef(cwd), data: null }))
route("GET", "vcs/branch", async ({ cwd }) =>
  send({ location: locationRef(cwd), data: { current: readBranch(cwd), branches: [] } }),
)
route("POST", "vcs/init", async () => send({ initialized: false, message: "not implemented" }))
route("GET", "experimental/usage/limits", async ({ cwd }) =>
  send({ data: { workspace: { id: "workspace", name: "local", usageURL: "" }, budgets: [] } }),
)
route("GET", "shell", async ({ cwd }) => send({ location: locationRef(cwd), data: [] }))
route("GET", "form", async () => send({ data: [] }))
route("GET", "permission/request", async ({ cwd }) => send({ location: locationRef(cwd), data: [] }))
route("GET", "permission/saved", async () => send({ data: [] }))
route("DELETE", "permission/saved/:id", async () => noContent())

/* ─── usage/cost stats scratch ──────────────────────────────────────── */

export const __unsafe = { sessions, pendingRequests, routes }
