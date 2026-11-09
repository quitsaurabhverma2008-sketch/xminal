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

export async function readError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as {
          error?: { message?: string; type?: string };
          message?: string;
        };
        const message = parsed?.error?.message ?? parsed?.message;
        const type = parsed?.error?.type;
        if (typeof message === "string" && message.length > 0) {
          return type ? `${message} (${type})` : message;
        }
      } catch { /* not JSON after all */ }
    }
    return trimmed.slice(0, 400) || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export function joinUrl(base: string, suffix: string): string {
  return `${base.replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`;
}
