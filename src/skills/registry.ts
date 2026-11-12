/**
 * Native skills.sh registry installer.
 *
 * The official skills.sh REST API requires Vercel OIDC, so this installer
 * works from what is public: the sitemap (index) and GitHub's codeload
 * (tarballs). It needs no credentials and no `npx skills` (which requires a
 * newer Node than some phones have).
 *
 * Everything is injectable for offline tests: pass `fetchImpl` and the code
 * never touches the network.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import { projectSkillsDir } from "../config/paths";
import { ensureDir, exists } from "../util/fs";

export interface RegistrySkill {
  readonly owner: string;
  readonly repo: string;
  /** the skill name — catalogs may call it `skill` (sitemap) or `name` */
  readonly skill: string;
  readonly url: string;
}

/** Accept either shape (offline catalog entries use `name`). */
export function toRegistrySkill(entry: { owner: string; repo: string; url: string; skill?: string; name?: string }): RegistrySkill {
  const skill = entry.skill ?? entry.name;
  if (!skill) throw new Error("catalog entry is missing the skill name");
  return { owner: entry.owner, repo: entry.repo, skill, url: entry.url };
}

const SITEMAP_SOURCES = (n: number): string[] =>
  [`https://skills.sh/sitemap-skills-${n}.xml`];

/** Parse the sitemap XML into skill coordinates. Pure. */
export function parseSitemap(xml: string): RegistrySkill[] {
  const out: RegistrySkill[] = [];
  const pattern = /<loc>\s*https?:\/\/(?:www\.)?skills\.sh\/([^/<\s]+)\/([^/<\s]+)\/([^/<\s]+)\s*<\/loc>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    const [, owner, repo, skill] = match;
    if (!owner || !repo || !skill) continue;
    out.push({ owner, repo, skill, url: `https://skills.sh/${owner}/${repo}/${skill}` });
  }
  return out;
}

/** Rank: skill-name prefix > skill-name contains > repo contains. Pure. */
export function searchRegistry(entries: readonly RegistrySkill[], query: string, limit = 10): RegistrySkill[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.slice(0, limit);
  const scored: Array<{ entry: RegistrySkill; score: number }> = [];
  for (const entry of entries) {
    const name = entry.skill.toLowerCase();
    const repo = entry.repo.toLowerCase();
    let score = 0;
    if (name.startsWith(q)) score = 100;
    else if (name.includes(q)) score = 60;
    else if (repo.includes(q)) score = 30;
    else continue;
    scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.skill.localeCompare(b.entry.skill));
  return scored.slice(0, limit).map((s) => s.entry);
}

export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

export interface RegistryCacheOptions {
  /** disk cache path; pass false to disable caching (tests) */
  readonly cacheFile?: string | false;
  /** max age in ms for a cached index (default 24h) */
  readonly maxAgeMs?: number;
}

function defaultCacheFile(): string {
  return path.join(os.homedir(), ".xminal", "skills-index.json");
}

/**
 * The index is ~1 MB of XML per sitemap page — cache it on disk for a day
 * instead of downloading thousands of <loc> entries on every search.
 */
export async function fetchRegistryIndex(
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  cache: RegistryCacheOptions = {},
): Promise<RegistrySkill[]> {
  const cacheFile = cache.cacheFile === false ? undefined : cache.cacheFile ?? defaultCacheFile();
  const maxAgeMs = cache.maxAgeMs ?? 24 * 60 * 60 * 1000;
  if (cacheFile) {
    try {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < maxAgeMs) {
        const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as RegistrySkill[];
        if (Array.isArray(cached) && cached.length > 0) return cached;
      }
    } catch {
      // cache miss or unreadable — fall through to the network
    }
  }
  const out: RegistrySkill[] = [];
  for (let page = 1; page <= 6; page += 1) {
    const url = SITEMAP_SOURCES(page)[0];
    const response = await fetchImpl(url);
    if (!response.ok) {
      if (page === 1) throw new Error(`skills.sh sitemap returned ${response.status} — the registry is unreachable right now`);
      break; // later pages may not exist
    }
    const xml = await response.text();
    const entries = parseSitemap(xml);
    if (entries.length === 0) break;
    out.push(...entries);
    if (!xml.includes(`sitemap-skills-${page + 1}.xml`) && page > 1) break;
  }
  if (out.length === 0) throw new Error("skills.sh registry returned an empty index");
  if (cacheFile) {
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(out), { mode: 0o600 });
    } catch {
      // the cache is a nicety — never fail the search over it
    }
  }
  return out;
}

/* ─── tar extraction (zero-dep) ─────────────────────────────────────────── */

export interface TarEntry {
  readonly path: string;
  readonly type: "file" | "directory" | "symlink" | "other";
  readonly content: Buffer;
}

/**
 * Read a .tar (uncompressed) buffer. Handles ustar prefix + pax/gnu extended
 * headers; refuses nothing, flags everything — the caller applies the safety
 * rules. Exposed for tests.
 */
export function parseTar(buffer: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let paxPath: string | undefined;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    // two zero blocks end the archive
    if (header.every((byte) => byte === 0)) {
      offset += 512;
      continue;
    }
    const readStr = (start: number, length: number): string => {
      const slice = header.subarray(start, start + length);
      const end = slice.indexOf(0);
      return slice.subarray(0, end === -1 ? length : end).toString("utf8");
    };
    let name = readStr(0, 100);
    const prefix = readStr(345, 155);
    if (prefix) name = `${prefix}/${name}`;
    const size = parseInt(readStr(124, 12).trim() || "0", 8) || 0;
    const typeflag = String.fromCharCode(header[156] || 48);
    offset += 512;
    const content = buffer.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    if (typeflag === "x" || typeflag === "g") {
      // pax extended header — the next entry gets its name from here
      const text = content.toString("utf8");
      const pathMatch = /\d+ path=([^\n]+)\n/.exec(text);
      if (pathMatch) paxPath = pathMatch[1];
      continue;
    }
    if (paxPath) {
      name = paxPath;
      paxPath = undefined;
    }
    const type: TarEntry["type"] =
      typeflag === "0" || typeflag === "\0" || typeflag === ""
        ? "file"
        : typeflag === "5"
          ? "directory"
          : typeflag === "2"
            ? "symlink"
            : "other";
    entries.push({ path: name, type, content: Buffer.from(content) });
  }
  return entries;
}

export function gunzip(buffer: Buffer): Buffer {
  return zlib.gunzipSync(buffer);
}

/**
 * Skills live at `<repo>/<skill>/SKILL.md` (or the repo root is the skill).
 * Returns the files of the best-matching skill folder, paths relative to it.
 * Safety: refuses absolute paths, `..`, symlinks; caps files and bytes.
 */
export function extractSkill(
  entries: readonly TarEntry[],
  skillName: string,
  options: { maxFiles?: number; maxBytes?: number } = {},
): { files: Array<{ path: string; content: Buffer }>; root: string } {
  const maxFiles = options.maxFiles ?? 500;
  const maxBytes = options.maxBytes ?? 25_000_000;
  const files = entries.filter((entry) => entry.type === "file");
  // strip the leading `<repo>-<ref>/` component codeload adds
  const stripped = files.map((entry) => {
    const parts = entry.path.split("/").filter(Boolean);
    return { entry, parts };
  });
  const wants = skillName.toLowerCase();
  const candidates = stripped.filter(({ parts }) => {
    const last = parts[parts.length - 1]?.toLowerCase();
    return last === "skill.md";
  });
  if (candidates.length === 0) throw new Error("the tarball contains no SKILL.md — this repository is not a skills repository");
  // prefer a folder named like the skill (case-insensitive), then the shortest path
  const scored = candidates.map(({ entry, parts }) => {
    const parent = parts[parts.length - 2]?.toLowerCase() ?? "";
    const exact = parent === wants ? 1000 : 0;
    return { entry, parts, score: exact - parts.length };
  });
  scored.sort((a, b) => b.score - a.score);
  const chosen = scored[0];
  const rootParts = chosen.parts.slice(0, -1); // everything except SKILL.md
  const prefix = rootParts.join("/");
  const rootBase = rootParts[rootParts.length - 1] ?? "";

  const out: Array<{ path: string; content: Buffer }> = [];
  let total = 0;
  for (const { entry, parts } of stripped) {
    if (prefix && !entry.path.startsWith(`${prefix}/`)) continue;
    if (!prefix && parts.length > 1) continue; // root-level SKILL.md → only the SKILL.md itself
    const relParts = entry.path.slice(prefix ? prefix.length + 1 : 0).split("/").filter(Boolean);
    if (relParts.length === 0) continue;
    // safety: no absolute paths, no traversal
    if (relParts.some((part) => part === ".." || part === "")) continue;
    const relPath = relParts.join("/");
    if (relPath.startsWith("/") || relPath.includes("\0")) continue;
    total += entry.content.length;
    if (out.length >= maxFiles) throw new Error(`skill has more than ${maxFiles} files — refusing`);
    if (total > maxBytes) throw new Error("skill is larger than 25 MB — refusing");
    out.push({ path: relPath, content: entry.content });
  }
  if (out.length === 0) throw new Error("no files matched the skill folder after safety filtering");
  return { files: out, root: rootBase };
}

/**
 * skills.sh v2 computedHash: for every file (sorted by path, UTF-8 byte
 * order), append `path NUL byteLength NUL content`, then SHA-256 everything.
 */
export function computedHashV2(files: readonly { path: string; content: Buffer }[]): string {
  const hash = createHash("sha256");
  const sorted = [...files].sort((a, b) => Buffer.compare(Buffer.from(a.path, "utf8"), Buffer.from(b.path, "utf8")));
  for (const file of sorted) {
    hash.update(file.path, "utf8");
    hash.update("\0", "utf8");
    hash.update(String(file.content.length), "utf8");
    hash.update("\0", "utf8");
    hash.update(file.content);
  }
  return hash.digest("hex");
}

export interface RegistryInstallResult {
  readonly name: string;
  readonly destination: string;
  readonly source: string;
  readonly computedHash: string;
  readonly fileCount: number;
}

export interface InstallOptions {
  readonly global?: boolean;
  readonly fetchImpl?: FetchLike;
  readonly homeDir?: string;
}

/**
 * Install a skill from its registry coordinates. The destination is replaced
 * atomically-ish (rm then copy). The v2 computedHash is recorded in
 * `.xminal/skills.lock.v2.json` alongside the source coordinates.
 */
export async function installFromRegistry(
  cwd: string,
  skill: RegistrySkill | { owner: string; repo: string; url: string; skill?: string; name?: string },
  options: InstallOptions = {},
): Promise<RegistryInstallResult> {
  const { owner, repo, skill: skillName, url } = toRegistrySkill(skill);
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const codeload = `https://codeload.github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tar.gz/HEAD`;
  const response = await fetchImpl(codeload);
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for ${owner}/${repo} — check the repository exists and is public`);
  }
  const tarball = Buffer.from(await response.arrayBuffer());
  const entries = parseTar(gunzip(tarball));
  const { files } = extractSkill(entries, skillName);
  const hash = computedHashV2(files);

  const skillsRoot = options.global
    ? path.join(options.homeDir ?? os.homedir(), ".xminal", "skills")
    : projectSkillsDir(cwd);
  const destination = path.join(skillsRoot, skillName);
  ensureDir(skillsRoot);
  fs.rmSync(destination, { recursive: true, force: true });
  for (const file of files) {
    const target = path.join(destination, file.path);
    const relative = path.relative(destination, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      fs.rmSync(destination, { recursive: true, force: true });
      throw new Error(`refusing path outside the skill directory: ${file.path}`);
    }
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, file.content);
  }

  // record v2 lock — additive next to the existing SKILL.md-hash lockfile
  try {
    const lockPath = path.join(cwd, ".xminal", "skills.lock.v2.json");
    const previous = exists(lockPath) ? (JSON.parse(fs.readFileSync(lockPath, "utf8") || "{}") as Record<string, unknown>) : {};
    const skills = { ...((previous.skills as Record<string, unknown>) ?? {}) };
    skills[skillName] = {
      computedHash: hash,
      source: `https://github.com/${owner}/${repo}`,
      url: url,
      installedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify({ version: 2, skills }, null, 2) + "\n", { mode: 0o600 });
  } catch {
    // the lock is advisory — installation already succeeded
  }

  return {
    name: skillName,
    destination,
    source: `https://github.com/${owner}/${repo}`,
    computedHash: hash,
    fileCount: files.length,
  };
}
