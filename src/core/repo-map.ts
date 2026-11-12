/**
 * Repository map — a compact, ranked picture of the codebase.
 *
 * The idea (popularised by aider): the model should know *what exists*
 * without the whole repository being loaded into the context. So we extract
 * the signatures of every file (exports, classes, functions, types), rank
 * them against the current request, and render only the top slice.
 *
 * Everything is local, bounded and offline: at most `maxFiles` files are
 * read, only the head of each file is parsed for signatures, and the
 * rendered map is capped by a character budget.
 */
import fs from "node:fs";
import path from "node:path";

export interface RepoMapEntry {
  /** path relative to the project root */
  readonly path: string;
  /** exported/declared names found in the file */
  readonly signatures: string[];
  /** relevance to the current request */
  readonly score: number;
  /** how many other files import this one (centrality) */
  refs: number;
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
  /** how many files to look at (default 400) */
  readonly maxFiles?: number;
  /** how many bytes of a file to read for signatures (default 32 KB) */
  readonly maxFileBytes?: number;
}

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "target", "vendor", ".next", ".nuxt",
  "coverage", ".cache", "__pycache__", ".venv", "venv", ".xminal", "assets", "site",
  "public", "docs", "examples", "fixtures", "e2e", "scripts",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt",
  ".rb", ".php", ".cs", ".swift", ".c", ".h", ".cpp", ".cc", ".hpp", ".sh", ".sql",
  ".json", ".yaml", ".yml", ".toml", ".md",
]);

/** Words that carry no signal when ranking files. */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "you", "your", "not",
  "but", "can", "will", "should", "would", "there", "here", "when", "what", "which",
  "make", "made", "need", "want", "please", "fix", "add", "use", "using", "code",
  "file", "files", "test", "tests", "run", "make", "sure", "also", "then", "them",
  "they", "some", "just", "like", "does", "done", "work", "works", "working",
]);

const SIGNATURE_PATTERNS: RegExp[] = [
  /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(?:function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:pub\s+)?(?:async\s+)?(?:fn|struct|enum|trait|impl)\s+([A-Za-z_][\w]*)/,
  /^\s*(?:def|class)\s+([A-Za-z_][\w]*)/,
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/,
  /^\s*(?:fun|class|object|interface)\s+([A-Za-z_][\w]*)/,
];

/** Words that hint the request is about behaviour, not layout. */
function tokensOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

const IMPORT_PATTERNS: RegExp[] = [
  /\bfrom\s+["']([^"']+)["']/g,
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s+["']([^"']+)["']/g,
];

/** The module specifiers a file imports (relative or package paths). */
export function extractImports(content: string): string[] {
  const out: string[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) out.push(match[1]);
      if (out.length >= 60) return out;
    }
  }
  return out;
}

/** Resolve an import specifier to a file in the map, when it is one. */
function resolveImport(spec: string, importer: string, byPath: Map<string, string>): string | undefined {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return undefined;
  const dir = path.posix.dirname(importer);
  const base = spec.startsWith("/")
    ? spec.slice(1)
    : path.posix.normalize(path.posix.join(dir === "." ? "" : dir, spec));
  const candidates = [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`,
    `${base}/index.ts`, `${base}/index.js`,
  ];
  for (const candidate of candidates) {
    const hit = byPath.get(candidate);
    if (hit) return hit;
  }
  return undefined;
}

/** Pull the declared names out of a file's head. */
export function extractSignatures(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of content.split("\n")) {
    if (out.length >= 24) break;
    for (const pattern of SIGNATURE_PATTERNS) {
      const match = pattern.exec(line);
      if (!match) continue;
      const name = match[1];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
      break;
    }
  }
  return out;
}

function* walk(dir: string, root: string, options: Required<RepoMapOptions>, counter: { count: number }): Generator<{ file: string; rel: string }> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (counter.count >= options.maxFiles) return;
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      yield* walk(full, root, options, counter);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) continue;
      counter.count += 1;
      yield { file: full, rel: path.relative(root, full).split(path.sep).join("/") };
    }
  }
}

/**
 * Build the map: every candidate file with its signatures, ranked against
 * the request.
 */
export function buildRepoMap(cwd: string, request = "", options: RepoMapOptions = {}): RepoMap {
  const opts: Required<RepoMapOptions> = {
    maxFiles: options.maxFiles ?? 400,
    maxFileBytes: options.maxFileBytes ?? 32 * 1024,
  };
  const terms = tokensOf(request);
  const entries: RepoMapEntry[] = [];
  const counter = { count: 0 };
  const importsByFile = new Map<string, string[]>();
  const byPath = new Map<string, string>();
  for (const item of walk(cwd, cwd, opts, counter)) {
    byPath.set(item.rel, item.rel);
  }
  for (const item of walk(cwd, cwd, opts, counter)) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(item.file);
    } catch {
      continue;
    }
    let head = "";
    try {
      const fd = fs.openSync(item.file, "r");
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
    const signatures = extractSignatures(head);
    importsByFile.set(item.rel, extractImports(head));
    const haystack = `${item.rel} ${signatures.join(" ")}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) score += 1;
    }
    // a file whose *name* matches a term is more relevant than a mention
    const fileName = path.basename(item.rel).toLowerCase();
    for (const term of terms) {
      if (fileName.includes(term)) score += 2;
    }
    entries.push({ path: item.rel, signatures, score, refs: 0, bytes: stat.size });
  }
  // centrality: how many other files import this one
  const refs = new Map<string, number>();
  for (const [importer, specifiers] of importsByFile) {
    for (const spec of specifiers) {
      const target = resolveImport(spec, importer, byPath);
      if (target) refs.set(target, (refs.get(target) ?? 0) + 1);
    }
  }
  for (const entry of entries) entry.refs = refs.get(entry.path) ?? 0;
  entries.sort((a, b) => b.score - a.score || b.refs - a.refs || a.path.localeCompare(b.path));
  return { entries, scanned: counter.count, truncated: counter.count >= opts.maxFiles };
}

/**
 * Render the map for the prompt.
 *
 * Files that matched the request come first; the rest are listed by path so
 * the model still knows they exist.
 */
export function renderRepoMap(map: RepoMap, options: { maxChars?: number; limit?: number } = {}): string {
  const maxChars = options.maxChars ?? 2200;
  const limit = options.limit ?? 60;
  if (map.entries.length === 0) return "";
  const relevant = map.entries.filter((e) => e.score > 0);
  const rest = map.entries.filter((e) => e.score === 0);
  const lines: string[] = [];
  const push = (entry: RepoMapEntry) => {
    const sigs = entry.signatures.length ? ` — ${entry.signatures.slice(0, 6).join(", ")}` : "";
    lines.push(`${entry.path}${sigs}`);
  };
  for (const entry of relevant.slice(0, limit)) push(entry);
  if (rest.length) {
    // the most-imported files are the backbone of the project
    const room = Math.max(0, limit - lines.length);
    const central = rest.filter((e) => e.refs > 0).slice(0, room);
    if (central.length) {
      lines.push("central files (most imported):");
      for (const entry of central) {
        const sigs = entry.signatures.length ? ` — ${entry.signatures.slice(0, 4).join(", ")}` : "";
        lines.push(`  ${entry.path} (${entry.refs} import(s))${sigs}`);
      }
    }
    const others = rest.filter((e) => e.refs === 0).map((e) => e.path);
    if (others.length) lines.push(`… ${others.length} more file(s): ${others.slice(0, 10).join(", ")}${others.length > 10 ? ", …" : ""}`);
  }
  let text = lines.join("\n");
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 1)}…`;
  return text;
}

/** A short summary line for the TUI. */
export function repoMapSummary(map: RepoMap): string {
  const relevant = map.entries.filter((e) => e.score > 0).length;
  return `${map.scanned} file(s) scanned · ${relevant} relevant${map.truncated ? " · truncated" : ""}`;
}
