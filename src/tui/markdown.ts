// Streaming-safe block+inline markdown renderer → ANSI lines.
// Design: stable per-block rendering. Code fences parse byte-exact. Tables are
// width-capped. Incomplete trailing structures degrade gracefully (never throw).
import { rgb, bgRgb, RESET, BOLD, ITALIC, T, inlineCode, fgMuted, fgAmber, fgGreen } from "./theme";
import { visibleWidth, splitGraphemes, stripAnsi } from "./width";

const C = {
  heading: fgAmber,
  bold: (t: string) => `${BOLD}${t}${RESET}`,
  italic: (t: string) => `${ITALIC}${t}${RESET}`,
  code: inlineCode,
  link: (t: string) => `${rgb(T.accent)}\x1b[4m${t}${RESET}`,
  quote: (t: string) => `${rgb(T.muted)}${t}${RESET}`,
  quoteBar: `${rgb(T.muted)}│${RESET}`,
};

// ─── inline rendering ──────────────────────────────────────────────
export function renderInline(text: string): string {
  // escape sequences that already exist (they were produced by us) pass through untouched
  let out = "";
  let rest = text;
  const token = /(`[^`]*`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  for (const match of rest.matchAll(token)) {
    const idx = match.index ?? 0;
    out += escapeProse(rest.slice(last, idx));
    const tok = match[0];
    if (tok.startsWith("`")) out += C.code(escapeProse(tok.slice(1, -1)));
    else if (tok.startsWith("**")) out += C.bold(escapeProse(tok.slice(2, -2)));
    else if (tok.startsWith("*")) out += C.italic(escapeProse(tok.slice(1, -1)));
    else if (tok.startsWith("_")) out += C.italic(escapeProse(tok.slice(1, -1)));
    else { // link [text](url)
      const close = tok.indexOf("](");
      const label = tok.slice(1, close);
      const url = tok.slice(close + 2, -1);
      out += C.link(escapeProse(label)) + fgMuted(` (${url})`);
    }
    last = idx + tok.length;
  }
  out += escapeProse(rest.slice(last));
  return out;
}

function escapeProse(text: string): string {
  // user-visible text: strip any ANSI the model may have emitted so it renders harmlessly
  return stripAnsi(text);
}

// ─── block rendering ───────────────────────────────────────────────
export interface RenderOptions { width: number }

export function renderMarkdown(input: string, options: RenderOptions): string[] {
  const out: string[] = [];
  const width = Math.max(8, options.width);
  const lines = input.split("\n");
  let i = 0;
  let inCode = false;
  let codeLang = "";
  let codeLines: string[] = [];
  const flushCode = () => {
    if (codeLines.length === 0) return;
    codeLines.splice(0, 0, ""); // keep code block separated visually; filled by header below
    const header = codeLang ? `${fgMuted("  ┌ " + codeLang)}` : "";
    if (header) out.push(header);
    for (const l of codeLines.slice(1)) {
      for (const wrapped of renderCodeLine(l, width)) out.push(wrapped);
    }
    out.push(""); // breathing room after block
    codeLines = [];
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw;
    const fenceOpen = /^```([a-zA-Z0-9_+-]*)[ \t]*$/.exec(line);
    if (fenceOpen) {
      if (inCode) { inCode = false; flushCode(); } else { inCode = true; codeLang = fenceOpen[1] ?? ""; }
      i += 1;
      continue;
    }
    if (inCode) { codeLines.push(line); i += 1; continue; }

    // headings
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = renderInline(heading[2]);
      out.push(level <= 2 ? `\x1b[1m${rgb(T.amber)}${text}${RESET}` : `\x1b[1m${rgb(T.text)}${text}${RESET}`);
      out.push("");
      i += 1;
      continue;
    }
    // hr
    if (/^([-_*])\s*(\1\s*){2,}$/.test(line.trim())) { out.push(`${rgb(T.muted)}${"─".repeat(Math.min(width, 40))}${RESET}`); i += 1; continue; }
    // blockquote
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      for (const w of wrapPlain(renderInline(quote[1]), Math.max(4, width - 2))) out.push(`${C.quoteBar} ${C.quote(w)}`);
      i += 1;
      continue;
    }
    // tables
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\|?[\s\-:|]+\|?$/.test(lines[i + 1].trim())) {
      const block: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { block.push(lines[i]); i += 1; }
      out.push(...renderTable(block, width));
      continue;
    }
    // unordered lists (with nesting via indent)
    const ul = /^(\s*)([-*+])\s+(.*)$/.exec(line);
    if (ul) {
      const depth = Math.floor(ul[1].length / 2);
      const indent = "  ".repeat(depth);
      const bullet = depth === 0 ? fgAmber("•") : fgMuted("◦");
      for (const w of wrapPlain(renderInline(ul[3]), Math.max(4, width - indent.length - 2))) {
        out.push(`${indent}${bullet} ${w}`);
      }
      i += 1;
      continue;
    }
    // ordered lists
    const ol = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
    if (ol) {
      const depth = Math.floor(ol[1].length / 2);
      const indent = "  ".repeat(depth);
      for (const w of wrapPlain(renderInline(ol[3]), Math.max(4, width - indent.length - 4))) {
        out.push(`${indent}${fgAmber(ol[2] + ".")} ${w}`);
      }
      i += 1;
      continue;
    }
    // blank
    if (/^\s*$/.test(line)) { out.push(""); i += 1; continue; }
    // paragraph
    for (const w of wrapPlain(renderInline(line), width)) out.push(w);
    i += 1;
  }
  if (inCode) flushCode(); // unterminated fence: render what we have, no crash
  return out;
}

function renderCodeLine(line: string, width: number): string[] {
  const bare = stripAnsi(line);
  const pad = "  "; // code blocks render flush-left with a leading marker
  const prefix = fgMuted("  │");
  if (visibleWidth(bare) <= width - visibleWidth(prefix) - 1) return [`${prefix} ${rgb(T.green)}${escapeProse2(bare)}${RESET}`];
  // wrap long code lines — preserve verbatim chars, never modify
  const out: string[] = [];
  let rest = bare;
  while (rest.length > 0) {
    const chunk = graphemeSliceToWidth(rest, width - visibleWidth(prefix) - 1);
    rest = rest.slice(chunk.columns === 0 ? 1 : chunk.consumed);
    out.push(`${prefix} ${rgb(T.green)}${chunk.text}${RESET}`);
    if (chunk.columns === 0) break;
  }
  return out;
}

function escapeProse2(text: string): string {
  return stripAnsi(text);
}

interface SliceResult { text: string; consumed: number; columns: number }
function graphemeSliceToWidth(text: string, maxWidth: number): SliceResult {
  let width = 0, consumed = 0, out = "";
  for (const g of splitGraphemes(text)) {
    const w = g === "\u200d" || /^[\p{Mn}\p{Me}]/u.test(g) ? 0 : (g.codePointAt(0)! >= 0x1100 && inWide(g.codePointAt(0)!) ? 2 : 1);
    if (width + w > maxWidth) break;
    out += g;
    consumed += g.length;
    width += w;
  }
  return { text: out, consumed, columns: width };
}
import { graphemeSlice } from "./width";
const WIDE_SET = (() => {
  const ranges: Array<[number, number]> = [
    [0x1100, 0x115f], [0x2e80, 0xa4cf], [0xa960, 0xa97f], [0xac00, 0xd7a3], [0xf900, 0xfaff],
    [0xfe30, 0xfe6b], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1faff], [0x20000, 0x3fffd],
  ];
  return ranges;
})();
function inWide(cp: number): boolean {
  for (const [a, b] of WIDE_SET) if (cp >= a && cp <= b) return true;
  return false;
}

function wrapPlain(input: string, width: number): string[] {
  // ANSI-aware greedy wrap preserving escape sequences
  const out: string[] = [];
  for (const paragraph of input.split("\n")) {
    let line = "";
    let visible = 0;
    for (const word of paragraph.split(/(\s+)/)) {
      const wv = visibleWidth(word);
      if (visible + wv <= width && !/^\s+$/.test(word)) {
        line += word;
        visible += wv;
      } else if (/^\s+$/.test(word)) {
        line += word;
        visible += wv;
      } else {
        if (visible > 0) { out.push(line.trimEnd()); line = ""; visible = 0; }
        // hard-wrap an overlong word
        let rest = word;
        while (visibleWidth(rest) > width) {
          const slice = graphemeSlice(rest, width);
          out.push(slice);
          rest = rest.slice(slice.length);
        }
        line = rest;
        visible = visibleWidth(rest);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

function renderTable(block: string[], width: number): string[] {
  const rows = block.map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  if (rows.length < 2) return block;
  const [header, , ...body] = rows; // second row is the separator
  const cols = header.length;
  const colWidths = header.map((h, i) => {
    const cells = [h, ...body.map((r) => r[i] ?? "")];
    return Math.min(60, Math.max(...cells.map((c) => visibleWidth(c)), 3));
  });
  const total = colWidths.reduce((a, b) => a + b, 0) + cols * 3 + 1;
  const scale = total > width ? (width - cols * 3 - 1) / colWidths.reduce((a, b) => a + b, 0) : 1;
  const widths = colWidths.map((w) => Math.max(3, Math.floor(w * scale)));
  const bar = `${rgb(T.muted)}${"─".repeat(Math.max(1, Math.min(width, total)))}${RESET}`;
  const out: string[] = [];
  const cell = (text: string, w: number) => {
    const clipped = visibleWidth(text) > w ? graphemeSlice(text, Math.max(1, w - 1)) + "…" : text;
    const rendered = renderInline(clipped);
    const pad = " ".repeat(Math.max(0, w - visibleWidth(clipped)));
    return rendered + pad;
  };
  const headerLine = widths.map((w, i) => ` ${BOLD}${cell(header[i] ?? "", w)}${RESET}`).join(`${rgb(T.muted)}│${RESET}`);
  out.push(`${rgb(T.muted)}│${RESET}${headerLine}${rgb(T.muted)}│${RESET}`);
  out.push(bar);
  for (const row of body) {
    const line = widths.map((w, i) => ` ${rgb(T.text)}${cell(row[i] ?? "", w)}${RESET}`).join(`${rgb(T.muted)}│${RESET}`);
    out.push(`${rgb(T.muted)}│${RESET}${line}${rgb(T.muted)}│${RESET}`);
  }
  out.push("");
  return out;
}
