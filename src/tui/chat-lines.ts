/**
 * The chat-line renderer — extracted from the startTui closure.
 *
 * Every transcript row (user panel, assistant markdown, reasoning, tool
 * activity cards — including the ± diff bands — and the quiet ok/err rows)
 * is produced here, so the rendering can be unit-tested without a PTY.
 *
 * `renderStyledLine` never throws and never reads the terminal size — the
 * caller passes the width.
 */
import { T, rgb, bgRgb, RESET, fgMuted, fgText, fgAmber, fgGreen, fgRed, fgAccent, modeColor, keepBg } from "./theme";
import { renderMarkdown } from "./markdown";
import { formatAssistantText, isLikelyDiff, tintDiffRow } from "./format";
import { renderActivity, toolTarget, type ActivityLine } from "./output/tool-activity";
import { visibleWidth, stripAnsi as stripAnsiW, wrapAnsi } from "./ansi";
import { redactSecrets } from "../util/redact";

export type LineKind = "user" | "assistant" | "reasoning" | "tool" | "ok" | "err" | "system";

export interface Line {
  kind: LineKind;
  text: string;
  /** present when kind === "tool" — merged onToolCall → onToolResult */
  activity?: ActivityLine;
  /** memoized render rows per width/mode/content; mutated in place by the caller */
  rows?: Map<string, string[]>;
}

const visible = visibleWidth;
const wrap = (text: string, width: number): string[] => wrapAnsi(text, width);

const formatCache = new Map<string, string>();
const formatMemo = (text: string): string => {
  const hit = formatCache.get(text);
  if (hit !== undefined) return hit;
  const out = formatAssistantText(text);
  if (formatCache.size > 512) formatCache.clear();
  formatCache.set(text, out);
  return out;
};
const mdCache = new Map<string, string[]>();
const mdMemo = (text: string, width: number): string[] => {
  const key = `${width}:${text}`;
  const hit = mdCache.get(key);
  if (hit) return hit;
  const out = renderMarkdown(text, { width: Math.max(4, width) });
  if (mdCache.size > 512) mdCache.clear();
  mdCache.set(key, out);
  return out;
};
const diffTint = (rows: string[]): string[] =>
  rows.map((row) => tintDiffRow(row, () => row, fgMuted, fgAccent, fgGreen, fgRed));

/** Render one transcript line into rows (already width-fitted). Never throws. */
export function renderStyledLine(line: Line, w: number, options: { mode?: string } = {}): string[] {
  // ── tool activity — opencode: inline row (glyph col 3) or a block card
  if (line.kind === "tool" && line.activity) {
    const a = line.activity;
    const block = a.name === "bash" || a.name === "git" || a.name === "worktree";
    if (block && a.status !== "pending" && a.output && a.output.length) {
      // opencode block tool: ┃ rule at content col 0, raised panel, text at col 3
      const cardW = Math.max(8, w);
      const cmd = toolTarget(a.name, a.argsRaw, cardW - 4);
      const rule = `${rgb(T.bg)}┃${RESET}`;
      const fill = bgRgb(T.panel);
      const card = (body: string) =>
        `${rule}${fill}  ${keepBg(fill, body)}${" ".repeat(Math.max(0, cardW - 4 - visible(body)))}${RESET}`;
      const rows: string[] = [];
      rows.push(`${rule}${fill}  ${fgText("$")} ${fgText(cmd)}${" ".repeat(Math.max(0, cardW - 4 - visible(cmd) - 2))}${RESET}`);
      for (const outLine of a.output.slice(0, 10)) {
        rows.push(card(a.status === "err" ? fgRed(outLine) : fgMuted(outLine)));
      }
      if (a.extraLines && a.extraLines > a.output.length - 1) {
        rows.push(card(fgMuted(`… ${a.extraLines - (a.output.length - 1)} more lines`)));
      }
      return rows;
    }
    // opencode: an edit/write diff is a block card — ┃ rule, raised panel,
    // and ± rows get the diff background bands (#20303b / #37222c)
    if (a.preview && a.preview.length) {
      const cardW = Math.max(8, w);
      const rule = `${rgb(T.bg)}┃${RESET}`;
      const panel = bgRgb(T.panel);
      const addBg = bgRgb(T.diffAddedBg);
      const remBg = bgRgb(T.diffRemovedBg);
      const rows: string[] = [];
      for (const row of a.preview) {
        const bare = stripAnsiW(row).trimStart();
        const isAdd = bare.startsWith("+") && !bare.startsWith("+++");
        const isRem = bare.startsWith("-") && !bare.startsWith("---");
        const fill = isAdd ? addBg : isRem ? remBg : panel;
        const tinted = tintDiffRow(row, () => row, fgMuted, fgAccent, fgGreen, fgRed);
        rows.push(`${rule}${fill} ${keepBg(fill, tinted)}${" ".repeat(Math.max(0, cardW - 2 - visible(tinted)))}${RESET}`);
      }
      if (a.extraPreviewLines) {
        const more = fgMuted(`… ${a.extraPreviewLines} more diff lines`);
        rows.push(`${rule}${panel} ${keepBg(panel, more)}${" ".repeat(Math.max(0, cardW - 2 - visible(more)))}${RESET}`);
      }
      return rows;
    }
    const out: string[] = renderActivity(a, Math.max(8, w - 5)).map((row) => `   ${row}`);
    if (a.status === "err" && a.detail) {
      out.push(`     ${fgMuted(redactSecrets(a.detail).text)}`);
    }
    return out;
  }
  // ── user — opencode: ┃ rule in the agent colour, raised fill, 2 col padding
  if (line.kind === "user") {
    const bar = modeColor(options.mode ?? "build");
    const inner = Math.max(4, w - 1);
    const textW = Math.max(4, inner - 4);
    const fill = bgRgb(T.panel);
    const padRow = `${bar}┃${fill}${" ".repeat(inner)}${RESET}`;
    const bodyRows = wrap(line.text, textW).map(
      (part) => `${bar}┃${fill}  ${rgb(T.text)}${part}${" ".repeat(Math.max(0, inner - 4 - visible(part)))}${RESET}`,
    );
    return [padRow, ...bodyRows, padRow];
  }
  // ── assistant — opencode: plain text at content col 3, markdown
  if (line.kind === "assistant") {
    const clean = formatMemo(line.text);
    const body = mdMemo(clean, Math.max(4, w - 3));
    return body.map((row) => `   ${row}`);
  }
  // ── reasoning — opencode: ┃ rule at col 3, body at col 5
  if (line.kind === "reasoning") {
    const inner = Math.max(4, w - 6);
    const rows = wrap(line.text, Math.max(4, inner));
    // opencode: the reasoning rule uses the warning colour
    return rows.map((part) => `   ${fgAmber("┃")} ${fgMuted(part)}`);
  }
  // ── everything else (ok/err/system) — quiet, indented at col 3
  const color = line.kind === "err" ? fgRed : line.kind === "ok" ? fgGreen : fgMuted;
  const safe = redactSecrets(line.text).text;
  const out: string[] = [];
  for (const part of wrap(safe, Math.max(4, w - 3))) {
    out.push(`   ${color(part)}`);
  }
  if ((line.kind === "ok" || line.kind === "err") && isLikelyDiff(line.text)) {
    return diffTint(out);
  }
  return out;
}
