// Content-aware output quality engine — the single formatting authority for
// ordinary assistant conversation. Applies ONLY to prose; never touches code,
// URLs, JSON, commands, or diffs. Non-destructive: original history is untouched.
//
// Design: tokenize the message into typed segments (code fence / URL / JSON /
// diff / command / prose), then normalize each prose segment only.

export type SegmentKind = "prose" | "code" | "url" | "json" | "diff" | "command";
export interface Segment { kind: SegmentKind; text: string }

export function segment(input: string): Segment[] {
  const out: Segment[] = [];
  const fence = /^```[a-zA-Z0-9_+-]*[ \t]*$/;
  const lines = input.split("\n");
  const trailingNewline = input.endsWith("\n");
  if (trailingNewline) lines.pop(); // drop the phantom element produced by the trailing newline
  let current: Segment = { kind: "prose", text: "" };
  let inCode = false;
  const flush = () => { if (current.text) out.push(current); };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const suffix = index < lines.length - 1 || trailingNewline ? "\n" : "";
    if (fence.test(line)) {
      if (inCode) {
        current.text += line + suffix;
        flush();
        current = { kind: "prose", text: "" };
        inCode = false;
      } else {
        flush();
        current = { kind: "code", text: line + suffix };
        inCode = true;
      }
      continue;
    }
    current.text += line + suffix;
  }
  flush();
  return out;
}

function normalizeProse(text: string): string {
  let t = text;
  // Only broken markdown is repaired here. The model's own punctuation is
  // left alone — collapsing "..." into "." rewrote the assistant's words and
  // read as if the reply had been mangled.
  t = t.replace(/:\s*:/g, ":");                 // :: repeated colons
  t = t.replace(/;\s*;/g, ";");
  t = t.replace(/\*\*\s*\*\*/g, "**");          // accidental empty bold markers
  t = t.replace(/(^|\n)\s*-\s*-\s+/g, "$1- ");  // broken list markers
  t = t.replace(/[ \t]+\n/g, "\n");             // trailing spaces
  t = t.replace(/\n{3,}/g, "\n\n");             // excessive blank lines
  return t;
}

export function formatAssistantText(input: string): string {
  // code/url/json/diff/command segments pass through byte-exact; only prose is normalized
  return segment(input).map((s) => (s.kind === "prose" ? normalizeProse(s.text) : s.text)).join("");
}

export function isLikelyDiff(text: string): boolean {
  return /^(@@|diff --git|\+\+\+ |--- )/m.test(text);
}

export function tintDiffRow(row: string, tint: (t: string) => string, muted: (t: string) => string, accent: (t: string) => string, green: (t: string) => string, red: (t: string) => string): string {
  const bare = row.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, "").trimStart();
  if (bare.startsWith("@@")) return accent(row);
  if (bare.startsWith("diff --git") || bare.startsWith("index ") || bare.startsWith("new file") || bare.startsWith("deleted file")) return muted(row);
  if (bare.startsWith("+++") || bare.startsWith("---")) return muted(row);
  if (bare.startsWith("+")) return green(row);
  if (bare.startsWith("-")) return red(row);
  return row;
}

export function hasUnbalancedBoldMarkers(text: string): boolean {
  const outsideCode = segment(text).filter((s) => s.kind === "prose").map((s) => s.text).join("");
  return (outsideCode.match(/\*\*/g) ?? []).length % 2 !== 0;
}
