/**
 * The project constitution — the rules that outlive a single feature.
 *
 * A constitution is a versioned markdown file:
 *
 *   ```markdown
 *   # Project Constitution
 *   **Version**: 1.0.0 | **Ratified**: 2026-11-12 | **Last Amended**: 2026-11-12
 *   ## Core Principles
 *   ### I. Offline-First
 *   - MUST: Every capability works without network access.
 *   - MUST NOT: Add a runtime dependency without a maintainer decision.
 *   ```
 *
 * Two things happen with it: the rules go into the prompt of the agent (MUST
 * sentences first, bounded), and they are checked against the files a change
 * touched (deterministic, no model call). The check is the interesting half:
 * a rule that is never checked is a slogan.
 */
import fs from "node:fs";
import path from "node:path";

export interface Principle {
  /** the roman numeral of the principle, e.g. "I" */
  id: string;
  /** the title of the principle, e.g. "Offline-First" */
  title: string;
  /** the hard rules */
  must: string[];
  /** the preferred practices */
  should: string[];
  /** the forbidden changes */
  mustNot: string[];
}

export interface Constitution {
  /** where the constitution was read from */
  path: string;
  /** the semantic version, e.g. "1.0.0" */
  version: string;
  ratified?: string;
  lastAmended?: string;
  principles: Principle[];
  /** true when the file is still the unmodified template */
  isTemplate: boolean;
}

export interface ConstitutionFinding {
  severity: "critical" | "major" | "minor";
  /** the file that broke the rule */
  file: string;
  /** the principle that was broken */
  principle: string;
  message: string;
}

/** The file written when a project has no constitution yet. */
const CONSTITUTION_TEMPLATE = `# Project Constitution
**Version**: 0.1.0 | **Ratified**: <not ratified> | **Last Amended**: <not amended>

## Core Principles

### I. <Principle name>
- MUST: <the rule that is never broken>
- SHOULD: <the practice that is preferred>
- MUST NOT: <the change that is forbidden>
`;

/** Files whose change means "a dependency was added". */
const DEPENDENCY_MANIFESTS = new Set([
  "package.json", "requirements.txt", "cargo.toml", "go.mod", "pom.xml", "composer.json",
]);

/** A file whose name says it holds something sensitive. */
const SENSITIVE_FILE = /\.env|secret|credential|\.pem$|\.key$/i;

/** A source file — not a test. */
const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|c|cc|cpp|h|sql|sh)$/i;

/** A test file. */
const TEST_FILE = /(^|\/)(tests?|__tests__|spec|specs|e2e)(\/|$)|\.(test|spec)\.[a-z]+$/i;

/** A line that pulls in a network client. */
const NETWORK_IMPORT =
  /\b(?:fetch|axios|node-fetch|got|superagent|undici|XMLHttpRequest)\b|from\s+["'](?:node:)?https?["']|require\(\s*["'](?:node:)?https?["']\s*\)|["'`]https?:\/\//;

/**
 * The constitution of a project, or `undefined` when it has none.
 *
 * `.xminal/constitution.md` wins over `docs/constitution.md`.
 */
export function loadConstitution(cwd: string): Constitution | undefined {
  const candidates = [
    path.join(cwd, ".xminal", "constitution.md"),
    path.join(cwd, "docs", "constitution.md"),
  ];
  for (const file of candidates) {
    let raw: string;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    return parseConstitution(file, raw);
  }
  return undefined;
}

/**
 * Raise a semantic version.
 *
 * `bumpVersion("1.2.3", "minor")` → `"1.3.0"`. A version that cannot be read
 * is returned unchanged — guessing a version is worse than keeping it.
 */
export function bumpVersion(version: string, kind: "major" | "minor" | "patch"): string {
  const match = (version ?? "").trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return version;

  const major = Number(match[1]);
  const minor = match[2] === undefined ? 0 : Number(match[2]);
  const patch = match[3] === undefined ? 0 : Number(match[3]);
  const prefix = (version ?? "").trim().startsWith("v") ? "v" : "";

  if (kind === "major") return `${prefix}${major + 1}.0.0`;
  if (kind === "minor") return `${prefix}${major}.${minor + 1}.0`;
  return `${prefix}${major}.${minor}.${patch + 1}`;
}

/**
 * The constitution as it goes into the prompt.
 *
 * The MUST rules come first — they are the ones that must not be missed —
 * then the MUST NOT rules, then the SHOULD rules. The result is bounded: a
 * constitution that fills the prompt is a constitution nobody reads.
 */
export function renderConstitutionForPrompt(constitution: Constitution, maxChars = 1200): string {
  const lines: string[] = [`Constitution v${constitution.version}`];

  for (const principle of constitution.principles) {
    for (const rule of principle.must) lines.push(`- MUST: ${rule} (${principle.title})`);
  }
  for (const principle of constitution.principles) {
    for (const rule of principle.mustNot) lines.push(`- MUST NOT: ${rule} (${principle.title})`);
  }
  for (const principle of constitution.principles) {
    for (const rule of principle.should) lines.push(`- SHOULD: ${rule} (${principle.title})`);
  }

  const text = lines.join("\n");
  if (maxChars <= 0 || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 12))}…[truncated]`;
}

/**
 * Check a change against the constitution.
 *
 * The rules are deterministic and conservative — they only fire on facts that
 * are in the changed files:
 *
 *   - a dependency manifest changed while a MUST NOT forbids dependencies → critical
 *   - a file that looks like a secret changed while a MUST NOT forbids secrets → critical
 *   - source changed without a test while a MUST demands tests → major
 *   - a changed file pulls in a network client while a MUST demands offline → minor
 */
export function checkConstitution(
  constitution: Constitution,
  changedFiles: string[],
  diffText?: string,
): ConstitutionFinding[] {
  const findings: ConstitutionFinding[] = [];
  const files = changedFiles ?? [];
  const anyTestChanged = files.some((file) => TEST_FILE.test(file));
  const networkFiles = diffText ? networkChanges(diffText, files) : new Set<string>();

  for (const principle of constitution.principles) {
    for (const rule of principle.mustNot) {
      if (/dependenc/i.test(rule)) {
        for (const file of files) {
          const name = path.basename(file).toLowerCase();
          if (!DEPENDENCY_MANIFESTS.has(name)) continue;
          findings.push({
            severity: "critical",
            file,
            principle: principle.title,
            message: `${file} changes a dependency manifest, but the constitution says: ${rule}`,
          });
        }
      }
      if (/secret|credential/i.test(rule)) {
        for (const file of files) {
          if (!SENSITIVE_FILE.test(file)) continue;
          findings.push({
            severity: "critical",
            file,
            principle: principle.title,
            message: `${file} looks like a credential file, but the constitution says: ${rule}`,
          });
        }
      }
    }

    for (const rule of principle.must) {
      if (/\btest/i.test(rule) && !anyTestChanged) {
        for (const file of files) {
          if (!SOURCE_FILE.test(file)) continue;
          if (TEST_FILE.test(file)) continue;
          findings.push({
            severity: "major",
            file,
            principle: principle.title,
            message: `${file} changed without a test, but the constitution says: ${rule}`,
          });
        }
      }
      if (/offline|network/i.test(rule)) {
        for (const file of files) {
          if (!networkFiles.has(normalize(file))) continue;
          findings.push({
            severity: "minor",
            file,
            principle: principle.title,
            message: `${file} adds a network client, but the constitution says: ${rule}`,
          });
        }
      }
    }
  }

  return findings;
}

// ── internals ─────────────────────────────────────────────────────────

function parseConstitution(file: string, raw: string): Constitution {
  const lines = raw.split(/\r?\n/);
  const principles: Principle[] = [];
  let current: Principle | undefined;

  for (const line of lines) {
    const heading = line.match(/^###\s+([IVXLCDM0-9]+)\.\s*(.+?)\s*$/i);
    if (heading) {
      current = { id: heading[1].toUpperCase(), title: heading[2].trim(), must: [], should: [], mustNot: [] };
      principles.push(current);
      continue;
    }
    if (/^#{1,2}\s/.test(line)) {
      current = undefined;
      continue;
    }
    if (!current) continue;

    const bullet = line.match(/^\s*[-*]\s*(MUST NOT|MUST|SHOULD)\s*:\s*(.+?)\s*$/i);
    if (!bullet) continue;
    const kind = bullet[1].toUpperCase();
    const rule = bullet[2].trim();
    if (!rule) continue;
    if (kind === "MUST NOT") current.mustNot.push(rule);
    else if (kind === "MUST") current.must.push(rule);
    else current.should.push(rule);
  }

  const constitution: Constitution = {
    path: file,
    version: (raw.match(/\*\*?\s*Version\s*\*?\*?\s*:\s*([^\s|*]+)/i)?.[1] ?? "").trim(),
    principles,
    isTemplate: looksLikeTemplate(raw),
  };
  const ratified = raw.match(/\*\*?\s*Ratified\s*\*?\*?\s*:\s*([^\s|*]+)/i)?.[1];
  if (ratified) constitution.ratified = ratified.trim();
  const amended = raw.match(/\*\*?\s*Last\s+Amended\s*\*?\*?\s*:\s*([^\s|*]+)/i)?.[1];
  if (amended) constitution.lastAmended = amended.trim();

  return constitution;
}

/** A constitution that still holds placeholders is a template. */
function looksLikeTemplate(raw: string): boolean {
  if (/<!--/.test(raw)) return true;
  if (/\bTODO\b|\bTEMPLATE\b|\bXXX\b/.test(raw)) return true;
  if (/\[(?:PROJECT|VERSION|RATIFIED|PRINCIPLE|DATE|TITLE)[^\]]*\]/i.test(raw)) return true;
  if (/<[^>\n]{1,40}>/.test(raw)) return true;
  const version = raw.match(/\*\*?\s*Version\s*\*?\*?\s*:\s*([^\s|*]+)/i)?.[1] ?? "";
  return version === "0.0.0" || version === "0.1.0";
}

/** The changed files whose added lines pull in a network client. */
function networkChanges(diffText: string, changedFiles: string[]): Set<string> {
  const allowed = new Set(changedFiles.map(normalize));
  const out = new Set<string>();
  let current = "";

  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      const file = line.slice(4).trim().replace(/^b\//, "");
      current = file === "/dev/null" ? "" : file;
      continue;
    }
    if (!current || !line.startsWith("+")) continue;
    const added = line.slice(1);
    if (!NETWORK_IMPORT.test(added)) continue;
    if (allowed.size > 0 && !allowed.has(normalize(current))) continue;
    out.add(normalize(current));
  }

  return out;
}

function normalize(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}
