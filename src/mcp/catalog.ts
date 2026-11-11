import fs from "node:fs";
import path from "node:path";

/**
 * Offline MCP catalog — thousands of public MCP servers, searchable by name,
 * by what they do ("work") and by where they run (mobile / windows / linux).
 *
 * The catalog is a data file (data/mcp-catalog.json, copied to dist/data at
 * build time) built from the Smithery registry + GitHub by
 * scripts/fetch-mcp-catalog.py — no network needed at runtime.
 */
export interface McpCatalogEntry {
  /** qualified id, e.g. "brave/search" */
  readonly id: string;
  /** display name */
  readonly name: string;
  /** what the server does (one line) */
  readonly work: string;
  /** homepage / docs */
  readonly url: string;
  /** where it can run: linux | windows | mobile */
  readonly platforms: readonly string[];
  /** hosted over HTTP (no local install needed) */
  readonly remote: boolean;
  /** popularity signal */
  readonly uses: number;
  /** catalog source */
  readonly source: string;
}

export interface McpCatalog {
  readonly source: string;
  readonly fetchedAt: string;
  readonly count: number;
  readonly servers: readonly McpCatalogEntry[];
}

export type McpPlatform = "linux" | "windows" | "mobile";

let cached: McpCatalog | undefined;

function catalogPath(): string {
  return path.join(__dirname, "..", "data", "mcp-catalog.json");
}

/** The catalog file stores short keys to stay small — expand them here. */
interface RawEntry {
  i?: string; n?: string; w?: string; u?: string; p?: string[]; r?: boolean; c?: number; s?: string;
  id?: string; name?: string; work?: string; url?: string; platforms?: string[]; remote?: boolean; uses?: number; source?: string;
}

function expand(raw: RawEntry): McpCatalogEntry | undefined {
  const id = raw.id ?? raw.i;
  if (!id) return undefined;
  return {
    id,
    name: raw.name ?? raw.n ?? id,
    work: raw.work ?? raw.w ?? "",
    url: raw.url ?? raw.u ?? "",
    platforms: raw.platforms ?? raw.p ?? ["linux", "windows", "mobile"],
    remote: raw.remote ?? raw.r ?? false,
    uses: raw.uses ?? raw.c ?? 0,
    source: raw.source ?? raw.s ?? "catalog",
  };
}

export function loadMcpCatalog(): McpCatalog | undefined {
  if (cached) return cached;
  for (const candidate of [catalogPath(), path.join(process.cwd(), "data", "mcp-catalog.json")]) {
    try {
      const raw = JSON.parse(fs.readFileSync(candidate, "utf8")) as {
        source?: string;
        fetchedAt?: string;
        count?: number;
        servers?: RawEntry[];
      };
      if (!raw || !Array.isArray(raw.servers) || raw.servers.length === 0) continue;
      const servers = raw.servers.map(expand).filter((e): e is McpCatalogEntry => Boolean(e));
      if (servers.length === 0) continue;
      cached = {
        source: raw.source ?? "catalog",
        fetchedAt: raw.fetchedAt ?? "",
        count: raw.count ?? servers.length,
        servers,
      };
      return cached;
    } catch {
      // try the next location
    }
  }
  return undefined;
}

export interface McpSearchOptions {
  /** restrict to servers that run on this platform */
  readonly platform?: McpPlatform | string;
  /** max results (0 = unlimited) */
  readonly limit?: number;
}

/**
 * Search the catalog. Matching order: exact id/name → name prefix → name
 * contains → "work" (description) contains. Optional platform filter.
 */
export function searchMcpServers(query: string, options: McpSearchOptions = {}): McpCatalogEntry[] {
  const catalog = loadMcpCatalog();
  if (!catalog) return [];
  const q = query.trim().toLowerCase();
  const platform = options.platform?.trim().toLowerCase();
  const limit = options.limit ?? 0;

  const scored: Array<{ entry: McpCatalogEntry; score: number }> = [];
  for (const entry of catalog.servers) {
    if (platform && !entry.platforms.includes(platform)) continue;
    let score = 0;
    if (q) {
      const id = entry.id.toLowerCase();
      const name = entry.name.toLowerCase();
      const work = entry.work.toLowerCase();
      if (id === q || name === q) score = 100;
      else if (id.startsWith(q) || name.startsWith(q)) score = 80;
      else if (id.includes(q) || name.includes(q)) score = 60;
      else if (work.includes(q)) score = 40;
      else continue;
      // prefer popular servers within the same score
      score += Math.min(15, Math.log10(Math.max(1, entry.uses)) * 2);
    }
    scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
  const out = scored.map((s) => s.entry);
  return limit > 0 ? out.slice(0, limit) : out;
}

/** Config snippet that adds the server to ~/.xminal/config.json */
export function mcpConfigSnippet(entry: McpCatalogEntry): string {
  const name = entry.id.replace(/[^a-zA-Z0-9_-]/g, "-");
  if (entry.remote) {
    return JSON.stringify(
      { mcpServers: { [name]: { command: ["npx", "-y", "@modelcontextprotocol/server-${name}"] } } },
      null,
      2,
    );
  }
  return JSON.stringify(
    { mcpServers: { [name]: { command: ["npx", "-y", "@modelcontextprotocol/server-${name}"] } } },
    null,
    2,
  );
}

export function platformTags(entry: McpCatalogEntry): string {
  return entry.platforms.map((p) => p.toUpperCase()).join(" ");
}
