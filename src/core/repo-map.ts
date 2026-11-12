/**
 * Repository map — a compact, ranked picture of the codebase.
 *
 * The idea: the model should know *what exists* and *where* without the whole
 * repository being loaded into the context. So every file is reduced to its
 * definitions and references (with line numbers), those form a graph
 * (referencer → definer), and the graph is ranked — a file that important
 * files depend on is important, even when the request never mentions it.
 *
 * The ranking is a weighted PageRank over the ident graph, plus a boost for
 * the identifiers the request actually mentions.
 *
 * Everything is local, bounded and offline.
 */
import fs from "node:fs";
import path from "node:path";

export type TagKind = "def" | "ref";

export interface MapTag {
  /** the identifier */
  readonly name: string;
  /** 1-based line number */
  readonly line: number;
  readonly kind: TagKind;
}

export interface RepoMapSymbol extends MapTag {}

export interface RepoMapEntry {
  /** path relative to the project root */
  readonly path: string;
  /** the definitions this file declares */
  readonly symbols: MapTag[];
  /** the identifiers other files use to reach this one */
  readonly referencedBy: number;
  /** rank of the file in the graph (plus the request boost) */
  readonly score: number;
  readonly bytes: number;
}

export interface RepoMap {
  readonly entries: RepoMapEntry[];
  /** how many files were looked at */
  readonly scanned: number;
  /** true when the scan hit its file budget */
  readonly truncated: boolean;
}

export interface RepoMapOptions {
  /** how many files to look at (default 600) */
  readonly maxFiles?: number;
  /** how many bytes of a file to read (default 48 KB) */
  readonly maxFileBytes?: number;
  /** identifiers the request mentions (aider's "mentioned idents") */
  readonly mentioned?: string[];
}

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "target", "vendor", ".next", ".nuxt",
  "coverage", ".cache", "__pycache__", ".venv", "venv", ".xminal", "assets", "site",
  "public", "examples", "fixtures", "e2e", ".pnpm-store",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt",
  ".rb", ".php", ".cs", ".swift", ".c", ".h", ".cpp", ".cc", ".hpp", ".sh", ".sql",
  ".json", ".yaml", ".yml", ".toml", ".md",
]);

/** Files that always belong in the map — they explain how the project builds. */
const IMPORTANT_FILES = [
  "package.json", "tsconfig.json", "jsconfig.json", "Cargo.toml", "go.mod", "pyproject.toml",
  "Makefile", "Dockerfile", "docker-compose.yml", "pom.xml", "build.gradle", "composer.json",
  "README.md", "AGENTS.md", "CONTRIBUTING.md",
];

/** Words that carry no signal when ranking files. */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "you", "your", "not",
  "but", "can", "will", "should", "would", "there", "here", "when", "what", "which",
  "make", "made", "need", "want", "please", "fix", "add", "use", "using", "code",
  "file", "files", "test", "tests", "run", "sure", "also", "then", "them", "they",
  "some", "just", "like", "does", "done", "work", "works", "working", "into",
]);

/** Ranking multipliers (tuned the same way aider tunes them). */
export const RANK_MUL = {
  /** an identifier the request mentions */
  mentionedIdent: 10,
  /** a long, distinctive identifier (snake/kebab/camel, >= 8 chars) */
  longIdent: 10,
  /** a private identifier */
  privateIdent: 0.1,
  /** defined in more than five files — too common to be useful */
  manyDefiners: 0.1,
  /** referenced by many files */
  refDamping: 0.5,
  /** a definition nothing references */
  unreferencedDef: 0.1,
};

/* ── tag extraction ───────────────────────────────────────────────────── */

const DEF_PATTERNS: RegExp[] = [
  /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(?:function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:pub\s+)?(?:async\s+)?(?:fn|struct|enum|trait|impl)\s+([A-Za-z_][\w]*)/,
  /^\s*(?:def|class)\s+([A-Za-z_][\w]*)/,
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/,
  /^\s*(?:fun|class|object|interface)\s+([A-Za-z_][\w]*)/,
];

const REF_PATTERNS: RegExp[] = [
  /\bfrom\s+["']([^"']+)["']/g,
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s+["']([^"']+)["']/g,
];

/** The definitions a file declares. */
export function extractDefinitions(content: string): MapTag[] {
  const out: MapTag[] = [];
  const seen = new Set<string>();
  const lines = content.split("\n");
  for (let i = 0; i < lines.length && out.length < 40; i += 1) {
    const line = lines[i];
    for (const pattern of DEF_PATTERNS) {
      const match = pattern.exec(line);
      if (!match) continue;
      const name = match[1];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, line: i + 1, kind: "def" });
      break;
    }
  }
  return out;
}

/** The identifiers a file uses (calls, imports, mentions). */
export function extractReferences(content: string): MapTag[] {
  const out: MapTag[] = [];
  const seen = new Set<string>();
  const lines = content.split("\n");
  for (let i = 0; i < lines.length && out.length < 120; i += 1) {
    const line = lines[i];
    // a call or a bare use of an identifier
    const call = /\b([A-Za-z_$][\w$]{2,})\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = call.exec(line)) !== null) {
      const name = match[1];
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({ name, line: i + 1, kind: "ref" });
      if (out.length >= 120) break;
    }
  }
  return out;
}

/** The module specifiers a file imports. */
export function extractImports(content: string): string[] {
  const out: string[] = [];
  for (const pattern of REF_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) out.push(match[1]);
      if (out.length >= 80) return out;
    }
  }
  return out;
}

/* ── the graph ───────────────────────────────────────────────────────── */

interface Graph {
  /** file → file → weight */
  out: Map<string, Map<string, number>>;
  /** file → incoming weight */
  incoming: Map<string, number>;
  nodes: Set<string>;
}

function addEdge(graph: Graph, from: string, to: string, weight: number): void {
  let targets = graph.out.get(from);
  if (!targets) {
    targets = new Map();
    graph.out.set(from, targets);
  }
  targets.set(to, (targets.get(to) ?? 0) + weight);
  graph.incoming.set(to, (graph.incoming.get(to) ?? 0) + weight);
  graph.nodes.add(from);
  graph.nodes.add(to);
}

/**
 * Weighted PageRank over the file graph.
 *
 * Pure iteration — no dependency, deterministic, and good enough for a few
 * hundred files.
 */
export function pagerank(graph: Graph, options: { damping?: number; iterations?: number } = {}): Map<string, number> {
  const damping = options.damping ?? 0.85;
  const iterations = options.iterations ?? 24;
  const nodes = [...graph.nodes];
  const n = nodes.length;
  const rank = new Map<string, number>();
  if (n === 0) return rank;
  for (const node of nodes) rank.set(node, 1 / n);

  for (let step = 0; step < iterations; step += 1) {
    const next = new Map<string, number>();
    let dangling = 0;
    for (const node of nodes) {
      const targets = graph.out.get(node);
      const total = targets ? [...targets.values()].reduce((a, b) => a + b, 0) : 0;
      if (!targets || total === 0) {
        dangling += rank.get(node) ?? 0;
        continue;
      }
      for (const [target, weight] of targets) {
        next.set(target, (next.get(target) ?? 0) + ((rank.get(node) ?? 0) * weight) / total);
      }
    }
    const spread = dangling / n;
    let diff = 0;
    for (const node of nodes) {
      const value = (1 - damping) / n + damping * ((next.get(node) ?? 0) + spread);
      diff += Math.abs(value - (rank.get(node) ?? 0));
      rank.set(node, value);
    }
    if (diff < 1e-6) break;
  }
  return rank;
}

/* ── building the map ────────────────────────────────────────────────── */

function tokensOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function isDistinctive(name: string): boolean {
  if (name.length < 8) return false;
  const snake = name.includes("_") && /[a-z]/.test(name);
  const kebab = name.includes("-") && /[a-z]/.test(name);
  const camel = /[A-Z]/.test(name) && /[a-z]/.test(name);
  return snake || kebab || camel;
}

/** Walk the project once, collecting the tags of every candidate file. */
function scan(cwd: string, opts: Required<RepoMapOptions>) {
  const files: Array<{ rel: string; abs: string; bytes: number; defs: MapTag[]; refs: MapTag[]; imports: string[] }> = [];
  const byPath = new Map<string, string>();
  let count = 0;

  const walk = (dir: string): void => {
    if (count >= opts.maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (count >= opts.maxFiles) return;
      if (entry.name.startsWith(".") && entry.name !== ".github") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.size > 2 * 1024 * 1024) continue;
      count += 1;
      const rel = path.relative(cwd, full).split(path.sep).join("/");
      byPath.set(rel, rel);
      let head = "";
      try {
        const fd = fs.openSync(full, "r");
        try {
          const buffer = Buffer.alloc(Math.min(stat.size, opts.maxFileBytes));
          fs.readSync(fd, buffer, 0, buffer.length, 0);
          head = buffer.toString("utf8");
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        continue;
      }
      files.push({
        rel,
        abs: full,
        bytes: stat.size,
        defs: extractDefinitions(head),
        refs: extractReferences(head),
        imports: extractImports(head),
      });
    }
  };
  walk(cwd);
  return { files, byPath, count };
}

/** Resolve an import specifier to a file in the project. */
function resolveImport(spec: string, importer: string, byPath: Map<string, string>): string | undefined {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return undefined;
  const dir = path.posix.dirname(importer);
  const base = spec.startsWith("/")
    ? spec.slice(1)
    : path.posix.normalize(path.posix.join(dir === "." ? "" : dir, spec));
  for (const candidate of [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`,
    `${base}.py`, `${base}.go`, `${base}.rs`,
    `${base}/index.ts`, `${base}/index.js`,
  ]) {
    const hit = byPath.get(candidate);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Build the map: the files, their symbols, and a rank derived from the graph
 * and from the request.
 */
export function buildRepoMap(cwd: string, request = "", options: RepoMapOptions = {}): RepoMap {
  const opts: Required<RepoMapOptions> = {
    maxFiles: options.maxFiles ?? 600,
    maxFileBytes: options.maxFileBytes ?? 48 * 1024,
    mentioned: options.mentioned ?? [],
  };
  const { files, byPath, count } = scan(cwd, opts);

  // defs / refs per identifier
  const defines = new Map<string, Set<string>>();
  const references = new Map<string, Map<string, number>>();
  for (const file of files) {
    for (const def of file.defs) {
      let set = defines.get(def.name);
      if (!set) {
        set = new Set();
        defines.set(def.name, set);
      }
      set.add(file.rel);
    }
    for (const ref of file.refs) {
      let map = references.get(ref.name);
      if (!map) {
        map = new Map();
        references.set(ref.name, map);
      }
      map.set(file.rel, (map.get(file.rel) ?? 0) + 1);
    }
  }

  // the graph: referencer → definer
  const graph: Graph = { out: new Map(), incoming: new Map(), nodes: new Set() };
  const mentioned = new Set(opts.mentioned.map((m) => m.toLowerCase()));
  const terms = tokensOf(request);

  for (const ident of defines.keys()) {
    const referencers = references.get(ident);
    if (!referencers) {
      // a definition nothing references still deserves a small edge
      for (const definer of defines.get(ident) ?? []) addEdge(graph, definer, definer, RANK_MUL.unreferencedDef);
      continue;
    }
    let multiplier = 1;
    if (mentioned.has(ident.toLowerCase())) multiplier *= RANK_MUL.mentionedIdent;
    if (isDistinctive(ident)) multiplier *= RANK_MUL.longIdent;
    if (ident.startsWith("_")) multiplier *= RANK_MUL.privateIdent;
    if ((defines.get(ident)?.size ?? 0) > 5) multiplier *= RANK_MUL.manyDefiners;
    for (const [referencer, count] of referencers) {
      const damped = Math.pow(count, RANK_MUL.refDamping);
      for (const definer of defines.get(ident) ?? []) {
        addEdge(graph, referencer, definer, multiplier * damped);
      }
    }
  }
  // direct imports are a strong signal too
  for (const file of files) {
    for (const spec of file.imports) {
      const target = resolveImport(spec, file.rel, byPath);
      if (target && target !== file.rel) addEdge(graph, file.rel, target, 1);
    }
  }

  const rank = pagerank(graph);
  const maxRank = Math.max(1e-9, ...rank.values());

  const entries: RepoMapEntry[] = files.map((file) => {
    const graphScore = (rank.get(file.rel) ?? 0) / maxRank;
    // the request boost: the path matters most, the declarations next
    let boost = 0;
    const filePath = file.rel.toLowerCase();
    const defNames = file.defs.map((d) => d.name.toLowerCase());
    for (const term of terms) {
      if (filePath.includes(term)) boost += 0.6;
      else if (defNames.some((name) => name === term)) boost += 0.2;
      else if (defNames.some((name) => name.includes(term))) boost += 0.1;
    }
    for (const ident of file.defs) {
      if (mentioned.has(ident.name.toLowerCase())) boost += 2;
    }
    const important = IMPORTANT_FILES.includes(path.basename(file.rel)) ? 0.15 : 0;
    return {
      path: file.rel,
      symbols: file.defs,
      referencedBy: Math.round(graph.incoming.get(file.rel) ?? 0),
      score: graphScore + boost + important,
      bytes: file.bytes,
    };
  });

  entries.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return { entries, scanned: count, truncated: count >= opts.maxFiles };
}

/**
 * Render the map for the prompt.
 *
 * The map is fitted to the budget entry by entry — a file is either in or out,
 * never cut in half — and each entry shows the definitions with their line
 * numbers so the model knows where to look.
 */
export function renderRepoMap(
  map: RepoMap,
  options: { maxChars?: number; limit?: number; chatFiles?: string[] } = {},
): string {
  const maxChars = options.maxChars ?? 2200;
  const limit = options.limit ?? 60;
  const chat = new Set(options.chatFiles ?? []);
  const relevant = map.entries.filter((e) => e.score > 0.15 && !chat.has(e.path));
  const rest = map.entries.filter((e) => !relevant.includes(e));

  const lines: string[] = [];
  const render = (entry: RepoMapEntry): string[] => {
    const symbols = entry.symbols.slice(0, 6).map((s) => `${s.name}:${s.line}`).join(", ");
    return [`${entry.path}:${symbols}`];
  };

  for (const entry of relevant.slice(0, limit)) {
    const row = render(entry);
    if (lines.join("\n").length + row[0].length + 1 > maxChars) break;
    lines.push(...row);
  }
  if (!lines.length && relevant.length) lines.push(...render(relevant[0]));

  if (rest.length) {
    const room = Math.max(0, limit - lines.length);
    const central = rest.filter((e) => e.referencedBy > 0).slice(0, room);
    if (central.length) {
      lines.push("central files (most depended on):");
      for (const entry of central) {
        const row = `  ${entry.path} (${entry.referencedBy} reference(s))`;
        if (lines.join("\n").length + row.length + 1 > maxChars) break;
        lines.push(row);
      }
    }
    const others = rest.filter((e) => e.referencedBy === 0).map((e) => e.path);
    if (others.length) {
      const row = `… ${others.length} more file(s): ${others.slice(0, 8).join(", ")}${others.length > 8 ? ", …" : ""}`;
      if (lines.join("\n").length + row.length + 1 <= maxChars) lines.push(row);
    }
  }
  const text = lines.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

/** A short summary line for the TUI. */
export function repoMapSummary(map: RepoMap): string {
  const relevant = map.entries.filter((e) => e.score > 0.15).length;
  return `${map.scanned} file(s) scanned · ${relevant} relevant${map.truncated ? " · truncated" : ""}`;
}
