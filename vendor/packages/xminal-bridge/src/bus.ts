/**
 * In-process event bus for the OpenCode wire format. The vendored TUI talks
 * HTTP/SSE — our fetch shim serves `/api/event` as `text/event-stream` fed
 * from this bus. Events are kept minimal but truthful: no fabricated
 * ordinals, no fake sequencing.
 */
export interface WireEvent {
  readonly id: string
  /** unix epoch millis */
  readonly created: number
  readonly type: string
  readonly data: Record<string, unknown>
  readonly location?: { readonly directory: string }
}

export type WireEventHandler = (event: WireEvent) => void

export class EventBus {
  private handlers = new Set<WireEventHandler>()
  private seq = 0

  subscribe(handler: WireEventHandler): () => void {
    this.handlers.add(handler)
    return () => {
      this.handlers.delete(handler)
    }
  }

  emit(type: string, data: Record<string, unknown>, directory?: string): WireEvent {
    const event: WireEvent = {
      id: `ev_${Date.now().toString(36)}_${++this.seq}`,
      created: Date.now(),
      type,
      data,
      ...(directory ? { location: { directory } } : {}),
    }
    for (const handler of [...this.handlers]) {
      try {
        handler(event)
      } catch {
        // an event handler that throws must not corrupt the agent loop
      }
    }
    return event
  }

  /** SSE stream: starts with `server.connected`, ends when the signal aborts. */
  stream(signal: AbortSignal | undefined, directory: string): AsyncIterable<WireEvent> {
    const bus = this
    const self = this
    return (async function* (): AsyncGenerator<WireEvent> {
      yield {
        id: "ev_connected",
        created: Date.now(),
        type: "server.connected",
        data: { version: "xminal-bridge" },
        location: { directory },
      }
      if (signal?.aborted) return
      const queue: WireEvent[] = []
      let resolve: (() => void) | undefined
      const unsubscribe = bus.subscribe((event) => {
        queue.push(event)
        resolve?.()
      })
      const onAbort = () => {
        resolve?.()
      }
      try {
        signal?.addEventListener("abort", onAbort)
        while (!signal?.aborted) {
          if (queue.length === 0) {
            await new Promise<void>((wake) => {
              resolve = wake
              // keepalive: the watchdog needs *some* bytes to count as activity
              setTimeout(wake, 10_000)
            })
            if (signal?.aborted) break
            if (queue.length === 0) {
              // harmless heartbeat frame — the TUI ignores unknown event types,
              // it just resets the connection watchdog
              yield { id: `ev_hb_${++self.seq}`, created: Date.now(), type: "server.heartbeat", data: {} }
            }
            continue
          }
          const event = queue.shift()!
          yield event
        }
      } finally {
        unsubscribe()
        signal?.removeEventListener("abort", onAbort)
      }
    })()
  }
}
