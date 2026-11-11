/**
 * Project context — what an agent needs to know about the repository before
 * it starts editing.
 *
 * The point is to spend the model's attention on the *code*, not on
 * rediscovering the project layout: instructions, build/test commands and the
 * file-type mix are collected once, bounded, and injected into the prompt.
 *
 * Everything here is local and offline — no network, no model call.
 */
import fs from "node:fs";
import path from "node:path";

export interface ProjectBrief {
  /** name of the project directory */
  readonly name: string;
  /** primary language, guessed from the file mix */
  readonly language: string;
  /** instructions files that exist in the project (names only) */
  readonly instructionFiles: string[];
  /** the project's own test command, if one could be detected */
  readonly testCommand?: string;
  /** the project's own build command */
  readonly buildCommand?: string;
  /** the command to run after a change (test + build when both exist) */
  readonly verifyCommand?: string;
  /** where the code lives (top-level source directories) */
  readonly sourceDirs: string[];
  /** how many tracked-ish files were seen, by extension */
  readonly fileCounts: Record<string, number>;
}

const INSTRUCTION_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  "CONTRIBUTING.md",
  ".github/copilot-instructions.md",
];

const SOURCE_DIRS = ["src", "lib", "app", "pkg", "internal", "cmd", "core", "server", "client", "packages", "modules"];
const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "target", "vendor", ".next", ".nuxt",
  "coverage", ".cache", "__pycache__", ".venv", "venv", ".xminal", "assets", "site",
]);

const EXTENSIONS: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
  ".mjs": "JavaScript", ".cjs": "JavaScript", ".py": "Python", ".go": "Go", ".rs": "Rust",
  ".java": "Java", ".kt": "Kotlin", ".rb": "Ruby", ".php": "PHP", ".cs": "C#", ".swift": "Swift",
  ".c": "C", ".h": "C", ".cpp": "C++", ".cc": "C++", ".hpp": "C++", ".sh": "Shell", ".sql": "SQL",
};

function readJson(file: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function exists(cwd: string, name: string): boolean {
  try {
    return fs.existsSync(path.join(cwd, name));
  } catch {
    return false;
  }
}

/** Detect the project's own commands from its build files. */
export function detectProjectCommands(cwd: string): { test?: string; build?: string; verify?: string } {
  const pkg = readJson(path.join(cwd, "package.json"));
  if (pkg) {
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    const test = scripts.test ? "npm test" : scripts["test:unit"] ? "npm run test:unit" : undefined;
    const build = scripts.build ? "npm run build" : undefined;
    const typecheck = scripts.typecheck ? "npm run typecheck" : undefined;
    const verify = scripts.verify
      ? "npm run verify"
      : [test, build ?? typecheck].filter(Boolean).join(" && ") || undefined;
    return { test, build, verify };
  }
  if (exists(cwd, "Cargo.toml")) return { test: "cargo test", build: "cargo build", verify: "cargo test" };
  if (exists(cwd, "go.mod")) return { test: "go test ./...", build: "go build ./...", verify: "go test ./..." };
  if (exists(cwd, "pyproject.toml") || exists(cwd, "pytest.ini")) {
    return { test: "python -m pytest -q", verify: "python -m pytest -q" };
  }
  if (exists(cwd, "pom.xml")) return { test: "mvn -q test", verify: "mvn -q test" };
  if (exists(cwd, "build.gradle") || exists(cwd, "build.gradle.kts")) {
    return { test: "./gradlew test", verify: "./gradlew test" };
  }
  if (exists(cwd, "composer.json")) return { test: "composer test", verify: "composer test" };
  if (exists(cwd, "Makefile")) return { test: "make test", verify: "make test" };
  return {};
}

/** Count file types and find the source directories — one shallow walk. */
function scanProject(cwd: string): { counts: Record<string, number>; dirs: string[] } {
  const counts: Record<string, number> = {};
  const dirs: string[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(cwd, { withFileTypes: true });
  } catch {
    return { counts, dirs };
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
    if (SOURCE_DIRS.includes(entry.name)) dirs.push(entry.name);
  }
  // one level of files per source dir is enough to learn the language mix
  for (const dir of dirs) {
    let files: fs.Dirent[] = [];
    try {
      files = fs.readdirSync(path.join(cwd, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.isFile()) continue;
      const ext = path.extname(file.name).toLowerCase();
      const language = EXTENSIONS[ext];
      if (language) counts[language] = (counts[language] ?? 0) + 1;
    }
  }
  return { counts, dirs };
}

/** Collect everything an agent should know about the repository. */
export function loadProjectBrief(cwd: string, configuredVerify?: string): ProjectBrief {
  const commands = detectProjectCommands(cwd);
  const { counts, dirs } = scanProject(cwd);
  const instructionFiles = INSTRUCTION_FILES.filter((name) => exists(cwd, name));
  const language = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  const verify = configuredVerify?.trim() || commands.verify;
  return {
    name: path.basename(cwd) || cwd,
    language,
    instructionFiles,
    testCommand: commands.test,
    buildCommand: commands.build,
    verifyCommand: verify,
    sourceDirs: dirs.slice(0, 6),
    fileCounts: counts,
  };
}

/** Render the brief for the prompt — bounded, so it never eats the context. */
export function renderProjectBrief(brief: ProjectBrief, maxChars = 900): string {
  const lines: string[] = [];
  lines.push(`Project: ${brief.name} · ${brief.language}`);
  if (brief.instructionFiles.length) {
    lines.push(`Instructions: read ${brief.instructionFiles.join(", ")} before editing`);
  }
  if (brief.sourceDirs.length) {
    const mix = Object.entries(brief.fileCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([lang, count]) => `${lang}×${count}`)
      .join(", ");
    lines.push(`Layout: ${brief.sourceDirs.join("/")}${mix ? ` (${mix})` : ""}`);
  }
  const commands = [brief.testCommand, brief.buildCommand].filter(Boolean).join(" · ");
  if (commands) lines.push(`Commands: ${commands}`);
  if (brief.verifyCommand) lines.push(`Verify after a change: ${brief.verifyCommand}`);
  const text = lines.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}
