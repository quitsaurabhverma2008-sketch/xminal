/**
 * Review analysis — deterministic checks over the actual diff.
 *
 * A model asked to "review the change" tends to speculate. This module
 * computes the facts first — which files changed, how many lines, which
 * protected paths were touched, whether tests changed with the code — and
 * turns them into findings with a severity and a `file:line` reference.
 *
 * The model still does the judgement work (is this code correct?), but it
 * argues about facts instead of guessing them.
 */
import path from "node:path";

export type Severity = "critical" | "major" | "minor";

export interface ReviewFinding {
  readonly severity: Severity;
  readonly file: string;
  /** 1-based line in the new file, when known */
  readonly line?: number;
  readonly message: string;
}

export interface DiffFile {
  readonly path: string;
  readonly added: number;
  readonly removed: number;
  /** new-file line numbers of the added lines */
  readonly addedLines: number[];
  readonly isNew: boolean;
  readonly isDeleted: boolean;
}

export interface DiffAnalysis {
  readonly files: DiffFile[];
  readonly findings: ReviewFinding[];
  readonly added: number;
  readonly removed: number;
  /** files that look like tests */
  readonly testFiles: string[];
  /** files that look like source */
  readonly sourceFiles: string[];
}

const DEPENDENCY_FILES = [
  "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "requirements.txt",
  "pyproject.toml", "poetry.lock", "Cargo.toml", "Cargo.lock", "go.mod", "go.sum",
  "pom.xml", "build.gradle", "build.gradle.kts", "composer.json", "Gemfile",
];

const TEST_PATTERN = /(^|\/)(tests?|__tests__|spec|specs|e2e)(\/|$)|\.(test|spec)\.[a-z]+$/i;
const SOURCE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb|php|cs|swift|c|cc|cpp|h|sql)$/i;

/** Mutable shape used while parsing (the exported one is read-only). */
interface MutableDiffFile {
  path: string;
  added: number;
  removed: number;
  addedLines: number[];
  isNew: boolean;
  isDeleted: boolean;
}

/** Parse a unified diff into per-file statistics. */
export function parseDiff(diff: string): DiffFile[] {
  const files: MutableDiffFile[] = [];
  let current: MutableDiffFile | undefined;
  let newLine = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      current = {
        path: match?.[2] ?? line.slice("diff --git ".length),
        added: 0,
        removed: 0,
        addedLines: [],
        isNew: false,
        isDeleted: false,
      };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("new file mode")) {
      current.isNew = true;
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      current.isDeleted = true;
      continue;
    }
    if (line.startsWith("@@")) {
      const match = /@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      newLine = match ? Number(match[1]) : 1;
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.added += 1;
      current.addedLines.push(newLine);
      newLine += 1;
      continue;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      current.removed += 1;
      continue;
    }
    if (line.startsWith(" ")) newLine += 1;
  }
  return files as DiffFile[];
}

/** True when the path matches one of the protected patterns. */
function isProtected(file: string, protectedPaths: string[]): boolean {
  for (const raw of protectedPaths) {
    const pattern = raw.replace(/^\*\*\//, "").replace(/\/\*\*$/, "");
    if (!pattern) continue;
    if (pattern.includes("*")) {
      const rx = new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
      if (rx.test(file)) return true;
      continue;
    }
    if (file === pattern || file.endsWith(`/${pattern}`)) return true;
  }
  return false;
}

/**
 * Analyse a diff: the facts, turned into findings.
 */
export function analyzeDiff(diff: string, options: { protectedPaths?: string[]; root?: string } = {}): DiffAnalysis {
  const files = parseDiff(diff);
  const findings: ReviewFinding[] = [];
  const protectedPaths = options.protectedPaths ?? [];
  const testFiles: string[] = [];
  const sourceFiles: string[] = [];
  let added = 0;
  let removed = 0;

  for (const file of files) {
    added += file.added;
    removed += file.removed;
    const name = path.basename(file.path);
    const isTest = TEST_PATTERN.test(file.path);
    if (isTest) testFiles.push(file.path);
    else if (SOURCE_PATTERN.test(file.path)) sourceFiles.push(file.path);

    if (isProtected(file.path, protectedPaths)) {
      findings.push({
        severity: "critical",
        file: file.path,
        line: file.addedLines[0],
        message: "a protected path was modified — this file should never be touched by an agent",
      });
    }
    if (DEPENDENCY_FILES.includes(name)) {
      findings.push({
        severity: "major",
        file: file.path,
        message: name.endsWith("lock") || name.endsWith("sum")
          ? "a lockfile changed — dependency versions moved"
          : "a dependency manifest changed — new or updated packages",
      });
    }
    if (file.isDeleted && file.removed > 0) {
      findings.push({
        severity: "major",
        file: file.path,
        message: `the file was deleted (${file.removed} line(s))`,
      });
    }
    if (file.removed > 0 && file.added === 0 && file.removed > 20) {
      findings.push({
        severity: "major",
        file: file.path,
        line: file.addedLines[0],
        message: `${file.removed} lines were removed and nothing was added — check that nothing was lost`,
      });
    }
    if (file.added + file.removed > 400) {
      findings.push({
        severity: "minor",
        file: file.path,
        message: `a large change (${file.added + file.removed} lines) — hard to review in one piece`,
      });
    }
  }

  // source changed but no test changed
  if (sourceFiles.length > 0 && testFiles.length === 0) {
    findings.push({
      severity: "minor",
      file: sourceFiles[0],
      message: "source changed but no test file changed — is the new behaviour covered?",
    });
  }

  const order: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file));
  return { files, findings, added, removed, testFiles, sourceFiles };
}

/** Render the findings for the prompt or the screen. */
export function renderFindings(analysis: DiffAnalysis, maxChars = 1600): string {
  if (analysis.findings.length === 0) {
    return `Diff: ${analysis.files.length} file(s), +${analysis.added}/-${analysis.removed}. No automatic risk flags.`;
  }
  const lines = [`Diff: ${analysis.files.length} file(s), +${analysis.added}/-${analysis.removed}`];
  for (const finding of analysis.findings) {
    const where = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    lines.push(`- [${finding.severity}] ${where} — ${finding.message}`);
  }
  let text = lines.join("\n");
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 1)}…`;
  return text;
}

/** A one-line summary for the TUI. */
export function reviewSummary(analysis: DiffAnalysis): string {
  const critical = analysis.findings.filter((f) => f.severity === "critical").length;
  const major = analysis.findings.filter((f) => f.severity === "major").length;
  const minor = analysis.findings.filter((f) => f.severity === "minor").length;
  return `+${analysis.added}/-${analysis.removed} in ${analysis.files.length} file(s) · ${critical} critical, ${major} major, ${minor} minor`;
}
