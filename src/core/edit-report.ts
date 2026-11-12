/**
 * Edit failure reporting — what went wrong, and what to do about it.
 *
 * "oldString not found" is useless on its own: the model has to guess what the
 * file actually looks like. This finds the nearest matching block in the file
 * (a fuzzy line comparison), says whether the replacement is already there,
 * and — when other edits in the same call succeeded — tells the model not to
 * repeat them.
 */

/** The similarity of two line arrays, 0…1 (a line-for-line ratio). */
export function lineRatio(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  // Longest common subsequence → ratio = 2 * lcs / (|a| + |b|)
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const lcs = dp[rows - 1][cols - 1];
  return (2 * lcs) / (a.length + b.length);
}

export interface NearestMatch {
  /** how similar the block is, 0…1 */
  readonly ratio: number;
  /** 1-based first line of the match */
  readonly startLine: number;
  /** 1-based last line of the match */
  readonly endLine: number;
  /** the matched lines */
  readonly text: string;
}

/**
 * Find the block in `content` that most resembles `needle`.
 *
 * `threshold` is the similarity that makes a suggestion worth showing.
 */
export function nearestLines(
  content: string,
  needle: string,
  options: { threshold?: number; context?: number } = {},
): NearestMatch | undefined {
  const threshold = options.threshold ?? 0.6;
  const context = options.context ?? 5;
  const haystack = content.split("\n");
  const wanted = needle.split("\n");
  if (wanted.length === 0) return undefined;

  let best = 0;
  let bestIndex = -1;
  for (let i = 0; i + wanted.length <= haystack.length; i += 1) {
    const chunk = haystack.slice(i, i + wanted.length);
    const ratio = lineRatio(wanted, chunk);
    if (ratio > best) {
      best = ratio;
      bestIndex = i;
    }
  }
  if (best < threshold || bestIndex < 0) return undefined;
  const start = Math.max(0, bestIndex - context);
  const end = Math.min(haystack.length, bestIndex + wanted.length + context);
  return {
    ratio: best,
    startLine: start + 1,
    endLine: end,
    text: haystack.slice(start, end).join("\n"),
  };
}

export interface EditFailureReport {
  /** the file, relative to the project */
  readonly path: string;
  readonly oldString: string;
  readonly newString: string;
  /** the nearest block in the file, when one is close enough */
  readonly nearest?: NearestMatch;
  /** the replacement is already in the file */
  readonly alreadyPresent: boolean;
  /** other edits of the same call that were applied */
  readonly appliedElsewhere: string[];
}

/** Render the failure so the model can act on it. */
export function renderEditFailure(report: EditFailureReport): string {
  const parts: string[] = [];
  parts.push(`## EditFailed: this block did not exactly match lines in ${report.path}`);
  parts.push("<<<<<<< SEARCH");
  parts.push(report.oldString);
  parts.push("=======");
  parts.push(report.newString);
  parts.push(">>>>>>> REPLACE");
  if (report.alreadyPresent) {
    parts.push("");
    parts.push(`The REPLACE lines are already in ${report.path} — nothing to do there.`);
  }
  if (report.nearest) {
    parts.push("");
    parts.push(`Did you mean to match these actual lines from ${report.path} (similarity ${Math.round(report.nearest.ratio * 100)}%)?`);
    parts.push("");
    parts.push(report.nearest.text);
  }
  parts.push("");
  parts.push(
    "The SEARCH section must match an existing block of lines exactly — including whitespace, comments and indentation.",
  );
  if (report.appliedElsewhere.length) {
    parts.push("");
    parts.push(
      `The other ${report.appliedElsewhere.length} edit(s) in this call were applied successfully: ${report.appliedElsewhere.join(", ")}. Do not repeat them.`,
    );
  }
  return parts.join("\n");
}
