/**
 * Offline skills.sh catalog — every skill in the public registry, searchable
 * without touching the network. Mirrors src/mcp/catalog.ts.
 *
 * The catalog is a data file (data/skills-catalog.json, copied to dist/data
 * at build time) built from the skills.sh sitemaps by
 * scripts/fetch-skills-catalog.py — no network needed at runtime.
 *
 * An entry is just the triple owner/repo/skill; the skills.sh sitemap carries
 * no descriptions, so nothing here invents one. Install uses
 * `installFromRegistry` in ./registry.ts, which downloads the GitHub tarball.
 */
import fs from "node:fs";
import path from "node:path";

export interface SkillsCatalogEntry {
  /** qualified id, e.g. "mattpocock/skills/tdd" */
  readonly id: string;
  /** skill name (last path segment) */
  readonly name: string;
  /** GitHub coordinates */
  readonly owner: string;
  readonly repo: string;
  /** skills.sh page (docs live in the repo) */
  readonly url: string;
}

export interface SkillsCatalog {
  readonly source: string;
  readonly fetchedAt: string;
  readonly count: number;
  readonly skills: readonly SkillsCatalogEntry[];
}

let cached: SkillsCatalog | undefined;

function catalogPath(): string {
  return path.join(__dirname, "..", "data", "skills-catalog.json");
}

function expand(id: string): SkillsCatalogEntry | undefined {
  const parts = id.split("/");
  if (parts.length !== 3) return undefined;
  const [owner, repo, name] = parts;
  if (!owner || !repo || !name) return undefined;
  return { id, name, owner, repo, url: `https://skills.sh/${id}` };
}

export function loadSkillsCatalog(): SkillsCatalog | undefined {
  if (cached) return cached;
  for (const candidate of [catalogPath(), path.join(process.cwd(), "data", "skills-catalog.json")]) {
    try {
      const raw = JSON.parse(fs.readFileSync(candidate, "utf8")) as {
        source?: string;
        fetchedAt?: string;
        count?: number;
        skills?: Array<{ i?: string; id?: string }>;
      };
      if (!raw || !Array.isArray(raw.skills) || raw.skills.length === 0) continue;
      const skills = raw.skills
        .map((entry) => expand(entry.id ?? entry.i ?? ""))
        .filter((entry): entry is SkillsCatalogEntry => Boolean(entry));
      if (skills.length === 0) continue;
      cached = {
        source: raw.source ?? "skills.sh",
        fetchedAt: raw.fetchedAt ?? "",
        count: raw.count ?? skills.length,
        skills,
      };
      return cached;
    } catch {
      // try the next location
    }
  }
  return undefined;
}

export interface SkillsSearchOptions {
  /** max results (0 = unlimited) */
  readonly limit?: number;
}

/**
 * Search the catalog. Ranking: exact name → name prefix → name contains →
 * owner/repo contains. No descriptions exist to match against — the name and
 * the coordinates are all we have, and pretending otherwise would be a lie.
 */
export function searchSkillsCatalog(query: string, options: SkillsSearchOptions = {}): SkillsCatalogEntry[] {
  const catalog = loadSkillsCatalog();
  if (!catalog) return [];
  const q = query.trim().toLowerCase();
  const limit = options.limit ?? 0;

  const scored: Array<{ entry: SkillsCatalogEntry; score: number }> = [];
  for (const entry of catalog.skills) {
    let score = 0;
    const name = entry.name.toLowerCase();
    const owner = entry.owner.toLowerCase();
    const repo = entry.repo.toLowerCase();
    const full = entry.id.toLowerCase();
    if (q) {
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 60;
      else if (full.startsWith(q)) score = 50;
      else if (owner.includes(q) || repo.includes(q) || full.includes(q)) score = 30;
      else continue;
    }
    scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
  const out = scored.map((s) => s.entry);
  return limit > 0 ? out.slice(0, limit) : out;
}

/** Refresh-proof summary for the TUI/CLI: count + fetch date. */
export function skillsCatalogMeta(): { count: number; fetchedAt: string; source: string } | undefined {
  const catalog = loadSkillsCatalog();
  return catalog ? { count: catalog.count, fetchedAt: catalog.fetchedAt, source: catalog.source } : undefined;
}
