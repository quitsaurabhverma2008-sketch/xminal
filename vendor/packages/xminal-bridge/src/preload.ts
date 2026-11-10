import { handleOpenCodeRequest, getBus } from "./http"

/**
 * Install the in-process shim as the fetch the vendored OpenCode client uses.
 * The vendored `app.tsx` is patched (four lines, documented) to prefer
 * `globalThis.__XMINAL_SHIM_FETCH` over its HTTP client — the bridge then
 * answers every API call without any network, backed by XMINAL's runtime.
 */
const cwd = process.cwd()

const shimFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const request = new Request(input as any, init)
  return handleOpenCodeRequest(request, cwd)
}

;(globalThis as any).__XMINAL_SHIM_FETCH = shimFetch

if (process.env.XMINAL_BRIDGE_DEBUG === "1") {
  process.stderr.write(`[xminal-bridge] shim installed for ${cwd}\n`)
}
