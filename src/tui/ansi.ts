/**
 * The single source of truth for terminal width.
 *
 * Two implementations used to exist: this module (used by the frame renderer)
 * and a second, divergent width table inside the markdown renderer — which
 * made emoji measure 1 instead of 2 and let code rows overflow the terminal.
 * Everything goes through here now.
 *
 * The ANSI parser is a scanner, not a regex: a hand-rolled regex missed
 * colon-form SGR (`ESC[38:2:1:2:3m`) and OSC terminated by ST, so such
 * sequences were counted as visible characters and every row containing them
 * was padded wrong.
 */

const CSI = /\x1b\[[0-9;:?<>= ]*[ -/]*[@-~]/g;
const OSC = /\x1b\][^\x07]*?(?:\x07|\x1b\\)/g;
const ESC = /\x1b./g;

/** Remove every escape sequence (CSI, OSC/BEL or ST, single-char ESC). */
export function stripAnsi(text: string): string {
  if (!text) return "";
  return text.replace(OSC, "").replace(CSI, "").replace(ESC, "");
}

/** The grapheme clusters of a string (ZWJ sequences and combining marks stay whole). */
const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : undefined;

export function splitGraphemes(text: string): string[] {
  if (!text) return [];
  if (segmenter) {
    const out: string[] = [];
    for (const part of segmenter.segment(text)) out.push(part.segment);
    return out;
  }
  // Fallback for runtimes without Intl.Segmenter: code points, which still
  // keeps a surrogate pair together.
  return [...text];
}

/* East Asian Wide / Fullwidth ranges (Wikipedia "East Asian Wide" table). */
const WIDE_RANGES: Array<[number, number]> = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x231a, 0x231b], // watch / hourglass
  [0x2329, 0x232a], // angle brackets
  [0x23e9, 0x23ec], // media controls
  [0x23f0, 0x23f0], [0x23f3, 0x23f3],
  [0x25fd, 0x25fe], [0x2614, 0x2615], [0x2648, 0x2653], [0x267f, 0x267f],
  [0x2693, 0x2693], [0x26a1, 0x26a1], [0x26aa, 0x26ab], [0x26bd, 0x26be],
  [0x26c4, 0x26c5], [0x26ce, 0x26ce], [0x26d4, 0x26d4], [0x26ea, 0x26ea],
  [0x26f2, 0x26f3], [0x26f5, 0x26f5], [0x26fa, 0x26fa], [0x26fd, 0x26fd],
  [0x2705, 0x2705], [0x270a, 0x270b], [0x2728, 0x2728], [0x274c, 0x274c],
  [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797],
  [0x27b0, 0x27b0], [0x27bf, 0x27bf], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff],
  [0xa000, 0xa4cf], [0xa960, 0xa97f], [0xac00, 0xd7a3],
  [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f],
  [0xff00, 0xff60], [0xffe0, 0xffe6],
  [0x16fe0, 0x16fe4], [0x16ff0, 0x16ff1],
  [0x17000, 0x187f7], [0x18800, 0x18cd5], [0x18d00, 0x18d08],
  [0x1b000, 0x1b11f], [0x1b150, 0x1b152], [0x1b164, 0x1b167], [0x1b170, 0x1b2fb],
  [0x1f004, 0x1f004], [0x1f0cf, 0x1f0cf], [0x1f18e, 0x1f18e], [0x1f191, 0x1f19a],
  [0x1f200, 0x1f320], [0x1f32d, 0x1f335], [0x1f337, 0x1f37c],
  [0x1f37e, 0x1f393], [0x1f3a0, 0x1f3ca], [0x1f3cf, 0x1f3d3],
  [0x1f3e0, 0x1f3f0], [0x1f3f4, 0x1f3f4], [0x1f3f8, 0x1f43e],
  [0x1f440, 0x1f440], [0x1f442, 0x1f4fc], [0x1f4ff, 0x1f53d],
  [0x1f54b, 0x1f54e], [0x1f550, 0x1f567], [0x1f57a, 0x1f57a],
  [0x1f595, 0x1f596], [0x1f5a4, 0x1f5a4], [0x1f5fb, 0x1f64f],
  [0x1f680, 0x1f6c5], [0x1f6cc, 0x1f6cc], [0x1f6d0, 0x1f6d2],
  [0x1f6d5, 0x1f6d7], [0x1f6dc, 0x1f6df], [0x1f6eb, 0x1f6ec],
  [0x1f6f4, 0x1f6fc], [0x1f7e0, 0x1f7eb], [0x1f7f0, 0x1f7f0],
  [0x1f90c, 0x1f93a], [0x1f93c, 0x1f945], [0x1f947, 0x1f9ff],
  [0x1fa70, 0x1faff], [0x1fbc0, 0x1fbe5],
  [0x20000, 0x2fffd], [0x30000, 0x3fffd],
];

const ZERO_WIDTH = /[\p{Mn}\p{Me}\p{Cf}\u200b\u200c\u200d\u2060\ufeff]/u;

/** The display width of ONE grapheme cluster. */
export function graphemeWidth(grapheme: string): number {
  if (!grapheme) return 0;
  // A ZWJ sequence (family emoji etc.) renders as one wide glyph — this must
  // be checked BEFORE the zero-width rule, which also matches a lone ZWJ.
  if (grapheme.includes("\u200d") && [...grapheme].some((ch) => ch !== "\u200d")) return 2;
  // Only a cluster made ENTIRELY of combining marks / format characters is
  // zero-width — "e" + combining acute is one normal column.
  const chars = [...grapheme];
  if (chars.every((ch) => ZERO_WIDTH.test(ch))) return 0;
  for (const ch of chars) {
    const code = ch.codePointAt(0) ?? 0;
    // variation selectors
    if (code >= 0xfe00 && code <= 0xfe0f) return 0;
    for (const [start, end] of WIDE_RANGES) {
      if (code >= start && code <= end) return 2;
    }
  }
  return 1;
}

/** The display width of a string, ignoring escape sequences. */
export function visibleWidth(text: string): number {
  if (!text) return 0;
  const stripped = stripAnsi(text);
  let width = 0;
  for (const grapheme of splitGraphemes(stripped)) width += graphemeWidth(grapheme);
  return width;
}

export interface SliceResult {
  readonly text: string;
  /** display width of the slice */
  readonly width: number;
  /** alias kept for the internal callers */
  readonly columns: number;
  readonly consumed: number;
  readonly truncated: boolean;
}

/** Cut a string to a display width, never splitting a grapheme cluster. */
export function graphemeSlice(text: string, width: number): SliceResult {
  let columns = 0;
  let consumed = 0;
  for (const grapheme of splitGraphemes(text)) {
    const graphemeSize = graphemeWidth(grapheme);
    if (columns + graphemeSize > width) break;
    columns += graphemeSize;
    consumed += grapheme.length;
  }
  // A string-like result: the callers treat it as a string (`slice.length`,
  // `String(slice)`) and read the metadata off it.
  const sliced = text.slice(0, consumed);
  const meta = { text: sliced, width: columns, columns, consumed, truncated: consumed < text.length };
  return Object.assign(new String(sliced), meta) as String & SliceResult;
}

/** Truncate to a display width with a trailing ellipsis. Grapheme-safe. */
export function truncateToWidth(text: string, width: number, ellipsis = "…"): string {
  if (visibleWidth(text) <= width) return text;
  const budget = Math.max(0, width - visibleWidth(ellipsis));
  if (budget === 0) return ellipsis.slice(0, width) || ellipsis;
  const slice = graphemeSlice(text, budget);
  return `${slice.text}${ellipsis}`;
}

/** Wrap an ANSI string by its display width, keeping the escape sequences. */
export function wrapAnsi(text: string, width: number): string[] {
  if (!text) return [""];
  // newlines are structural — wrap each segment separately
  const segments = text.split("\n");
  const lines: string[] = [];
  for (const segment of segments) {
    let current = "";
    let columns = 0;
    for (const token of segment.split(/(\s+)/)) {
      if (!token) continue;
      if (/^\s+$/.test(token)) {
        const size = visibleWidth(token);
        if (columns > 0 && columns + size <= width) {
          current += token;
          columns += size;
        }
        continue;
      }
      // a word that does not fit on the remaining space goes to a new line
      const tokenWidth = visibleWidth(token);
      if (columns > 0 && columns + tokenWidth > width) {
        lines.push(current.replace(/\s+$/, ""));
        current = "";
        columns = 0;
      }
      let rest = token;
      while (rest.length > 0) {
        const room = Math.max(1, width - columns);
        const slice = sliceToWidth(rest, room);
        if (slice.columns === 0 && slice.consumed === 0) {
          // a single grapheme wider than the budget is kept whole — a
          // grapheme is indivisible, and splitting it would corrupt it
          const grapheme = splitGraphemes(rest)[0];
          if (!grapheme) break;
          if (columns > 0) {
            lines.push(current.replace(/\s+$/, ""));
            current = "";
            columns = 0;
            continue;
          }
          lines.push(grapheme);
          rest = rest.slice(grapheme.length);
          continue;
        }
        // slices that consume only escape sequences add no width — they are
        // always accepted verbatim, never treated as an over-budget word
        current += slice.text;
        columns += slice.columns;
        rest = rest.slice(slice.consumed);
        if (columns >= width && rest.length > 0) {
          lines.push(current);
          current = "";
          columns = 0;
        }
      }
    }
    if (current || columns > 0) lines.push(current);
  }
  return lines.length ? lines : [""];
}

export const ansiAwareWidth = visibleWidth;
export const wrapAnsiByWidth = wrapAnsi;
export function hasAnsi(text: string): boolean {
  return OSC.test(text) || CSI.test(text) || ESC.test(text);
}

/** Slice to a width, keeping escape sequences out of the count. */
export function sliceToWidth(text: string, width: number): SliceResult {
  let columns = 0;
  let consumed = 0;
  while (consumed < text.length) {
    if (columns >= width) break; // stop before trailing escapes
    const escape = /^(?:\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-9;:?<>= ]*[ -/]*[@-~]|\x1b.)/.exec(text.slice(consumed));
    if (escape) {
      consumed += escape[0].length;
      continue;
    }
    const grapheme = splitGraphemes(text.slice(consumed))[0];
    if (!grapheme) break;
    const size = graphemeWidth(grapheme);
    if (columns + size > width) break;
    columns += size;
    consumed += grapheme.length;
  }
  return { text: text.slice(0, consumed), width: columns, columns, consumed, truncated: consumed < text.length };
}
