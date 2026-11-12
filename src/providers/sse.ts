export async function* sseJson(response: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response has no body stream");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const rawLine = buffer.slice(0, index).trimEnd();
      buffer = buffer.slice(index + 1);
      const line = rawLine.trimStart();
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload && payload !== "[DONE]") {
          try {
            yield JSON.parse(payload) as Record<string, unknown>;
          } catch {
            // ignore malformed keep-alive lines
          }
        }
      }
      index = buffer.indexOf("\n");
    }
  }
  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    const payload = tail.slice(5).trim();
    if (payload && payload !== "[DONE]") {
      try {
        yield JSON.parse(payload) as Record<string, unknown>;
      } catch {
        // ignore
      }
    }
  }
}

export interface ErrorDetail {
  readonly message: string;
  /** the machine-readable upstream code, when there is one */
  readonly code?: string;
  /** retry-after, in milliseconds */
  readonly retryAfterMs?: number;
}

/** Parse a provider error body + the rate-limit headers. */
export async function readErrorDetail(response: Response): Promise<ErrorDetail> {
  let retryAfterMs: number | undefined;
  const retryAfter = response.headers?.get?.("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) retryAfterMs = seconds * 1000;
    else {
      const date = Date.parse(retryAfter);
      if (Number.isFinite(date)) retryAfterMs = Math.max(0, date - Date.now());
    }
  }
  try {
    const text = await response.text();
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as {
          error?: { message?: string; type?: string; code?: string };
          message?: string;
          code?: string;
        };
        const message = parsed?.error?.message ?? parsed?.message;
        const code = parsed?.error?.code ?? parsed?.code;
        if (typeof message === "string" && message.length > 0) {
          return { message: code ? `${message} [code=${code}]` : message, code, retryAfterMs };
        }
      } catch { /* not JSON after all */ }
    }
    return { message: trimmed.slice(0, 400) || `${response.status} ${response.statusText}`, retryAfterMs };
  } catch {
    return { message: `${response.status} ${response.statusText}`, retryAfterMs };
  }
}

export async function readError(response: Response): Promise<string> {
  return (await readErrorDetail(response)).message;
}

export function joinUrl(base: string, suffix: string): string {
  return `${base.replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`;
}
