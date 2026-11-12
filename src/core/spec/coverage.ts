/**
 * Traceability analysis — does the work cover the spec?
 *
 * The agent must not claim that a feature is covered because the tasks look
 * thorough. This module computes the actual relation between the requirements
 * of a spec and the tasks of a plan:
 *
 *   - a requirement without a task is a coverage gap (critical when the
 *     requirement belongs to a P1 user story)
 *   - a task that maps to no requirement is unrequested work
 *   - a spec that still carries a `[NEEDS CLARIFICATION: …]` marker is
 *     ambiguous
 *   - two requirements that say the same thing are a duplication
 *
 * A task maps to a requirement when it cites the requirement id, or — as a
 * fallback — when it mentions a distinctive word of the requirement. The
 * fallback is marked with a note so the reader knows the link is weaker.
 *
 * Everything is deterministic: the same spec and tasks always produce the same
 * analysis and the same report.
 */
import { parseRequirements, parseTasks, parseUserStories, type Requirement, type TaskRef } from "./parse";

export interface CoverageRow {
  /** `FR-001` */
  requirementId: string;
  /** at least one task maps to this requirement */
  hasTask: boolean;
  /** the tasks that map to it */
  taskIds: string[];
  /** why the link is weak, when it is */
  note?: string;
}

export type GapCategory = "coverage" | "ambiguity" | "duplication" | "unrequested";
export type GapSeverity = "critical" | "high" | "medium" | "low";

export interface CoverageGap {
  /** stable id, e.g. `GAP-COVERAGE-FR-002` */
  id: string;
  category: GapCategory;
  severity: GapSeverity;
  /** where the problem is, e.g. `spec.md:FR-002` */
  locations: string[];
  summary: string;
}

export interface CoverageMetrics {
  totalRequirements: number;
  totalTasks: number;
  /** 0 – 100 */
  coveragePct: number;
  critical: number;
}

export interface CoverageAnalysis {
  requirements: Requirement[];
  tasks: TaskRef[];
  rows: CoverageRow[];
  gaps: CoverageGap[];
  metrics: CoverageMetrics;
}

/** Words that are too generic to identify a requirement. */
const GENERIC_WORDS = new Set([
  "system", "must", "should", "shall", "will", "would", "the", "and", "for", "with",
  "that", "this", "when", "where", "while", "every", "each", "all", "any", "not", "no",
  "are", "was", "were", "has", "have", "had", "its", "their", "there", "then", "than",
  "user", "users", "feature", "spec", "support", "provide", "provides",
  "allow", "allows", "able", "into", "from", "without", "within", "over", "under",
  "return", "returns", "using", "used", "use", "value", "values", "result", "results",
]);

/** The clarification marker of an unfinished spec. */
const CLARIFICATION = /\[NEEDS CLARIFICATION:\s*([^\]\n]*)\]/gi;

const SEVERITY_ORDER: Record<GapSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Analyse the relation between a spec and its tasks.
 */
export function analyzeCoverage(input: {
  spec: string;
  tasks: string;
  changedFiles?: string[];
}): CoverageAnalysis {
  const requirements = parseRequirements(input.spec);
  const tasks = parseTasks(input.tasks);
  const stories = parseUserStories(input.spec);
  const changed = new Set((input.changedFiles ?? []).map(normalizePath));

  // Which task maps to which requirement, and how sure are we?
  const taskMatches = new Map<string, { requirementId: string; keyword?: string }[]>();
  for (const task of tasks) {
    const matches = matchTask(task, requirements);
    if (matches.length > 0) taskMatches.set(task.id, matches);
  }

  const rows: CoverageRow[] = requirements.map((requirement) => {
    const matched: string[] = [];
    const keywordNotes: string[] = [];
    for (const task of tasks) {
      const matches = taskMatches.get(task.id) ?? [];
      const hit = matches.find((match) => match.requirementId === requirement.id);
      if (!hit) continue;
      matched.push(task.id);
      if (hit.keyword) keywordNotes.push(`${task.id} ('${hit.keyword}')`);
    }
    const row: CoverageRow = {
      requirementId: requirement.id,
      hasTask: matched.length > 0,
      taskIds: matched,
    };
    if (keywordNotes.length > 0) row.note = `keyword match: ${keywordNotes.join(", ")}`;
    return row;
  });

  const gaps: CoverageGap[] = [];

  // 1. requirements nobody works on
  for (const requirement of requirements) {
    const row = rows.find((candidate) => candidate.requirementId === requirement.id);
    if (!row || row.hasTask) continue;
    const story = storyOf(requirement, stories);
    const critical = !!story && story.priority === "P1";
    gaps.push({
      id: `GAP-COVERAGE-${requirement.id}`,
      category: "coverage",
      severity: critical ? "critical" : "high",
      locations: [`spec.md:${requirement.id}`],
      summary: critical
        ? `${requirement.id} belongs to the P1 story ${story!.id} but no task covers it`
        : `${requirement.id} is not covered by any task`,
    });
  }

  // 2. work nobody asked for
  for (const task of tasks) {
    if (taskMatches.has(task.id)) continue;
    const touched = task.files.filter((file) => changed.has(normalizePath(file)));
    gaps.push({
      id: `GAP-UNREQUESTED-${task.id}`,
      category: "unrequested",
      severity: "medium",
      locations: [`tasks.md:${task.id}`],
      summary: touched.length > 0
        ? `${task.id} maps to no requirement — it changes ${touched.join(", ")}`
        : `${task.id} maps to no requirement — the spec does not ask for this work`,
    });
  }

  // 3. an unfinished spec
  const markers = clarificationMarkers(input.spec);
  markers.forEach((marker, index) => {
    gaps.push({
      id: `GAP-AMBIGUITY-${index + 1}`,
      category: "ambiguity",
      severity: "high",
      locations: [`spec.md:${marker.line}`],
      summary: `the spec still waits for an answer: ${marker.text}`,
    });
  });

  // 4. the same requirement twice
  const groups = new Map<string, Requirement[]>();
  for (const requirement of requirements) {
    const key = normalizeText(requirement.text);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(requirement);
    else groups.set(key, [requirement]);
  }
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    const ids = bucket.map((requirement) => requirement.id);
    gaps.push({
      id: `GAP-DUPLICATION-${ids[0]}`,
      category: "duplication",
      severity: "medium",
      locations: ids.map((id) => `spec.md:${id}`),
      summary: `${ids.join(" and ")} state the same requirement`,
    });
  }

  const covered = rows.filter((row) => row.hasTask).length;
  const totalRequirements = requirements.length;

  return {
    requirements,
    tasks,
    rows,
    gaps: sortGaps(gaps),
    metrics: {
      totalRequirements,
      totalTasks: tasks.length,
      coveragePct: totalRequirements === 0 ? 100 : Math.round((covered / totalRequirements) * 100),
      critical: gaps.filter((gap) => gap.severity === "critical").length,
    },
  };
}

/**
 * A deterministic markdown report of an analysis.
 *
 * No timestamps, no counters that change between two runs — the same analysis
 * always renders the same text.
 */
export function renderCoverageReport(analysis: CoverageAnalysis): string {
  const lines: string[] = [];
  const covered = analysis.rows.filter((row) => row.hasTask).length;

  lines.push("# Coverage Report");
  lines.push("");
  lines.push(`- **Requirements**: ${analysis.metrics.totalRequirements}`);
  lines.push(`- **Tasks**: ${analysis.metrics.totalTasks}`);
  lines.push(`- **Coverage**: ${analysis.metrics.coveragePct}% (${covered}/${analysis.metrics.totalRequirements})`);
  lines.push(`- **Critical gaps**: ${analysis.metrics.critical}`);
  lines.push("");
  lines.push("## Traceability");
  lines.push("");
  lines.push("| Requirement | Story | Covered | Tasks | Note |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const row of analysis.rows) {
    const requirement = analysis.requirements.find((item) => item.id === row.requirementId);
    lines.push(
      `| ${cell(row.requirementId)} | ${cell(requirement?.story ?? "")} | ${row.hasTask ? "yes" : "no"} | ${cell(
        row.taskIds.join(", "),
      )} | ${cell(row.note ?? "")} |`,
    );
  }
  lines.push("");
  lines.push("## Gaps");
  lines.push("");
  if (analysis.gaps.length === 0) {
    lines.push("No gaps — every requirement is covered by a task.");
  } else {
    lines.push("| ID | Category | Severity | Location | Summary |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const gap of analysis.gaps) {
      lines.push(
        `| ${cell(gap.id)} | ${cell(gap.category)} | ${cell(gap.severity)} | ${cell(gap.locations.join(", "))} | ${cell(
          gap.summary,
        )} |`,
      );
    }
  }
  lines.push("");

  return lines.join("\n");
}

// ── internals ─────────────────────────────────────────────────────────

/** The requirement a task works on, and how the link was found. */
interface TaskMatch {
  requirementId: string;
  keyword?: string;
}

function matchTask(task: TaskRef, requirements: Requirement[]): TaskMatch[] {
  const text = task.text.toLowerCase();

  // 1. the task cites the requirement id
  const direct: TaskMatch[] = [];
  for (const requirement of requirements) {
    if (text.includes(requirement.id.toLowerCase())) direct.push({ requirementId: requirement.id });
  }
  if (direct.length > 0) return direct;

  // 2. fallback: a distinctive word of the requirement
  let best: TaskMatch | undefined;
  let bestHits = 0;
  for (const requirement of requirements) {
    const hits = distinctiveWords(requirement.text).filter((word) => containsWord(text, word));
    if (hits.length === 0) continue;
    if (hits.length > bestHits) {
      bestHits = hits.length;
      best = { requirementId: requirement.id, keyword: hits[0] };
    }
  }
  return best ? [best] : [];
}

/** The words of a requirement that can identify it. */
function distinctiveWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
  const unique: string[] = [];
  for (const word of words) {
    if (word.length < 5) continue;
    if (GENERIC_WORDS.has(word)) continue;
    if (!unique.includes(word)) unique.push(word);
  }
  return unique.sort((a, b) => b.length - a.length).slice(0, 3);
}

function containsWord(haystack: string, word: string): boolean {
  const index = haystack.indexOf(word);
  if (index === -1) return false;
  const before = index === 0 ? "" : haystack[index - 1];
  const after = haystack[index + word.length] ?? "";
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
}

/** The story of a requirement — explicit, or the only story of the spec. */
function storyOf(requirement: Requirement, stories: ReturnType<typeof parseUserStories>) {
  if (requirement.story) {
    const found = stories.find((story) => story.id === requirement.story);
    if (found) return found;
  }
  if (stories.length === 1) return stories[0];
  return undefined;
}

/** Every `[NEEDS CLARIFICATION: …]` marker with its line number. */
function clarificationMarkers(spec: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  const lines = spec.split(/\r?\n/);
  lines.forEach((raw, index) => {
    CLARIFICATION.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CLARIFICATION.exec(raw)) !== null) {
      out.push({ line: index + 1, text: match[0].trim() });
    }
  });
  return out;
}

/** The text of a requirement without markup and punctuation noise. */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\*\*/g, "")
    .replace(/[“”"'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizePath(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

function sortGaps(gaps: CoverageGap[]): CoverageGap[] {
  return gaps
    .map((gap, index) => ({ gap, index }))
    .sort((a, b) => {
      const severity = SEVERITY_ORDER[a.gap.severity] - SEVERITY_ORDER[b.gap.severity];
      if (severity !== 0) return severity;
      if (a.gap.category !== b.gap.category) return a.gap.category < b.gap.category ? -1 : 1;
      return a.index - b.index;
    })
    .map((entry) => entry.gap);
}

/** A markdown table cell that never breaks the table. */
function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}
