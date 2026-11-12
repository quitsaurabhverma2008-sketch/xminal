/**
 * Shell segmentation — split a command line into the commands it actually runs.
 *
 * Matching a whole command line against a dangerous pattern is wrong in both
 * directions: `echo "rm -rf /"` is a string, not a delete, and `rm  -rf  /`
 * (two spaces) or `rm -r -f /` slip past a naive regex. Splitting on the
 * operators first — while respecting quotes — lets the risk rules look at
 * real commands only.
 */

export interface ShellSegment {
  /** the command text of this segment */
  readonly text: string;
  /** the operator that ended it ("&&", ";", "|", …) */
  readonly operator: string;
}

const OPERATORS = ["&&", "||", ";;", ";", "|", "&", "\n"];

/** Split a command line into its segments. Quotes and escapes are respected. */
export function splitShell(command: string): ShellSegment[] {
  const segments: ShellSegment[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let i = 0;

  const push = (operator: string): void => {
    const text = current.trim();
    if (text) segments.push({ text, operator });
    current = "";
  };

  while (i < command.length) {
    const ch = command[i];
    if (escaped) {
      current += ch;
      escaped = false;
      i += 1;
      continue;
    }
    if (ch === "\\") {
      current += ch;
      escaped = true;
      i += 1;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      i += 1;
      continue;
    }
    const operator = OPERATORS.find((op) => command.startsWith(op, i));
    if (operator) {
      push(operator);
      i += operator.length;
      continue;
    }
    current += ch;
    i += 1;
  }
  push("");
  return segments;
}

/** The executable of a segment: the first word, with quotes removed. */
export function segmentExecutable(segment: string): string {
  const match = /^\s*(?:env\s+)?(?:[A-Za-z_][\w.-]*\/)?([A-Za-z_][\w.-]*)/.exec(segment);
  return match?.[1] ?? "";
}

/** The arguments of a segment (the executable removed). */
export function segmentArguments(segment: string): string[] {
  const parts = segment.trim().split(/\s+/).filter(Boolean);
  return parts.slice(1);
}
