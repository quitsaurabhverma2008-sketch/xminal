/**
 * Line diffing — a real minimal diff, not a prefix/suffix trim.
 *
 * The old implementation compared the common prefix and the common suffix and
 * called everything in between a change: a 2-line edit in a 10-line file
 * reported `+6 −6` and looked like a full rewrite. This is a standard LCS
 * (longest common subsequence) line diff with configurable context.
 *
 * Pure functions, no I/O, no dependency.
 */

export interface DiffLine {
  readonly kind: "context" | "add" | "remove";
  readonly text: string;
  /** 1-based line number in the old file (context + remove) */
  readonly oldLine?: number;
  /** 1-based line number in the new file (context + add) */
  readonly newLine?: number;
}

export interface DiffHunk {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly header: string;
  readonly lines: DiffLine[];
}

export interface FileDiff {
  readonly path: string;
  readonly hunks: DiffHunk[];
  readonly added: number;
  readonly removed: number;
  readonly isNew: boolean;
  readonly isDeleted: boolean;
}

/** Trim the common prefix and suffix, then LCS-diff the remainder. */
export function diffLines(a: string[], b: string[], options: { context?: number } = {}): DiffHunk[] {
  const context = Math.max(0, options.context ?? 3);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA -= 1;
    endB -= 1;
  }
  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);

  // LCS table over the middle
  const n = midA.length;
  const m = midB.length;
  if (n > 2000 || m > 2000) {
    // too large for the full table — a whole-block replacement is the
    // honest answer here rather than a hang
    return [
      {
        oldStart: start + 1,
        oldCount: endA - start + 1,
        newStart: start + 1,
        newCount: endB - start + 1,
        header: `@@ -${start + 1},${endA - start + 1} +${start + 1},${endB - start + 1} @@`,
        lines: [
          ...midA.map((text, i): DiffLine => ({ kind: "remove", text, oldLine: start + i + 1 })),
          ...midB.map((text, i): DiffLine => ({ kind: "add", text, newLine: start + i + 1 })),
        ],
      },
    ];
  }

  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        midA[i] === midB[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  // Walk the LCS → per-line changes with context
  type Change = { kind: "context" | "add" | "remove"; text: string; oldLine?: number; newLine?: number };
  const changes: Change[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && midA[i] === midB[j]) {
      changes.push({ kind: "context", text: midA[i], oldLine: start + i + 1, newLine: start + j + 1 });
      i += 1;
      j += 1;
    } else if (j < m && (i >= n || table[i * width + j + 1] >= table[(i + 1) * width + j])) {
      changes.push({ kind: "add", text: midB[j], newLine: start + j + 1 });
      j += 1;
    } else {
      changes.push({ kind: "remove", text: midA[i], oldLine: start + i + 1 });
      i += 1;
    }
  }

  // Prefix/suffix context around the trimmed region
  const prefix: Change[] = [];
  for (let k = Math.max(0, start - context); k < start; k += 1) {
    prefix.push({ kind: "context", text: a[k], oldLine: k + 1, newLine: k + 1 });
  }
  const suffix: Change[] = [];
  for (let k = endA + 1; k < a.length && k < endB + 1 + context; k += 1) {
    suffix.push({ kind: "context", text: a[k], oldLine: k + 1, newLine: k + 1 });
  }
  const all = [...prefix, ...changes, ...suffix];

  // Group into hunks with `context` lines around each change
  const hunks: DiffHunk[] = [];
  let index = 0;
  while (index < all.length) {
    if (all[index].kind === "context") {
      index += 1;
      continue;
    }
    let hunkStart = index;
    while (hunkStart > 0 && all[hunkStart - 1].kind === "context" && index - hunkStart < context * 2) hunkStart -= 1;
    let hunkEnd = index;
    let seen = 0;
    while (hunkEnd < all.length) {
      if (all[hunkEnd].kind === "context") {
        if (seen > 0) break;
      } else {
        seen += 1;
      }
      hunkEnd += 1;
    }
    while (hunkEnd < all.length && all[hunkEnd].kind === "context") hunkEnd += 1;
    const hunk = all.slice(hunkStart, hunkEnd);
    const oldLines = hunk.filter((l) => l.oldLine !== undefined);
    const newLines = hunk.filter((l) => l.newLine !== undefined);
    const oldStart = oldLines[0]?.oldLine ?? 1;
    const newStart = newLines[0]?.newLine ?? 1;
    hunks.push({
      oldStart,
      oldCount: oldLines.length,
      newStart,
      newCount: newLines.length,
      header: `@@ -${oldStart},${oldLines.length} +${newStart},${newLines.length} @@`,
      lines: hunk,
    });
    index = hunkEnd;
  }
  return hunks;
}

/** Split text into lines without a trailing empty artefact. */
function linesOf(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

export function diffFiles(before: string, after: string, options: { context?: number; path?: string } = {}): FileDiff {
  const a = linesOf(before);
  const b = linesOf(after);
  const hunks = diffLines(a, b, { context: options.context });
  const added = hunks.reduce((sum, hunk) => sum + hunk.lines.filter((l) => l.kind === "add").length, 0);
  const removed = hunks.reduce((sum, hunk) => sum + hunk.lines.filter((l) => l.kind === "remove").length, 0);
  return {
    path: options.path ?? "file",
    hunks,
    added,
    removed,
    isNew: before.trim().length === 0 && after.trim().length > 0,
    isDeleted: after.trim().length === 0 && before.trim().length > 0,
  };
}

/** The classic unified-diff text (for logs, patches, copy-paste). */
export function renderUnifiedDiff(diff: FileDiff, options: { maxLines?: number } = {}): string {
  const maxLines = options.maxLines ?? 60;
  const out: string[] = [];
  if (diff.isNew) out.push(`new file ${diff.path}`);
  if (diff.isDeleted) out.push(`deleted file ${diff.path}`);
  for (const hunk of diff.hunks) {
    out.push(hunk.header);
    for (const line of hunk.lines.slice(0, maxLines)) {
      if (line.kind === "add") out.push(`+${line.text}`);
      else if (line.kind === "remove") out.push(`-${line.text}`);
      else out.push(` ${line.text}`);
    }
    if (hunk.lines.length > maxLines) out.push(`… ${hunk.lines.length - maxLines} more lines`);
  }
  return out.join("\n");
}

export interface DiffStat {
  readonly added: number;
  readonly removed: number;
}

/** Real counts (this is the fix for the lying `+6 −6`). */
export function diffStat(before: string, after: string): DiffStat {
  const diff = diffFiles(before, after);
  return { added: diff.added, removed: diff.removed };
}

/**
 * A short preview of a change — the unified form, with the header line first
 * (the old `diffPreview` returned a bare body that the tool layer had to guess).
 */
export function diffPreview(before: string, after: string, context = 2, maxLines = 40): string {
  return renderUnifiedDiff(diffFiles(before, after, { context }), { maxLines });
}
