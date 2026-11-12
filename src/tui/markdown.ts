// Streaming-safe block+inline markdown renderer → ANSI lines.
// Design: stable per-block rendering. Code fences parse byte-exact. Tables are
// width-capped. Incomplete trailing structures degrade gracefully (never throw).
import { rgb, bgRgb, RESET, BOLD, ITALIC, T, inlineCode, fgMuted, fgAmber, fgGreen, fgPurple, fgAccent, fgOrange } from "./theme";
import { visibleWidth, splitGraphemes, stripAnsi, wrapAnsi as wrapPlain, sliceToWidth } from "./width";

const C = {
  heading: fgAmber,
  bold: (t: string) => `${BOLD}${rgb(T.yellow)}${t}${RESET}`,   // markdown.strong #f5a742
  italic: (t: string) => `${ITALIC}${t}${RESET}`,
  code: inlineCode,
  link: (t: string) => `${rgb(T.orange)}\x1b[4m${t}${RESET}`,   // markdown.link #fab283
  quote: (t: string) => `${rgb(T.muted)}${t}${RESET}`,
  quoteBar: `${rgb(T.muted)}│${RESET}`,
};

// ─── inline rendering ──────────────────────────────────────────────
function renderInline(text: string): string {
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
    if (codeLang) out.push(`${bgRgb(T.panel2)}${fgMuted("  " + codeLang)}${" ".repeat(Math.max(0, width - 2 - visibleWidth(codeLang)))}${RESET}`);
    for (const l of codeLines) {
      for (const wrapped of renderCodeLine(l, width, codeLang)) out.push(wrapped);
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

    // headings — H1 amber bold, H2 bright bold, H3+ muted bold; spacing above
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = renderInline(heading[2]);
      const style = level === 1 ? `\x1b[1m${rgb(T.violet)}` : level === 2 ? `\x1b[1m${rgb(T.text)}` : `\x1b[1m${rgb(T.muted)}`;
      if (level <= 2 && out.length > 0 && out[out.length - 1] !== "") out.push("");
      out.push(style + text + RESET);
      out.push("");
      i += 1;
      continue;
    }
    // hr
    if (/^([-_*])\s*(\1\s*){2,}$/.test(line.trim())) { out.push(`${rgb(T.borderSubtle)}${"─".repeat(Math.min(width, 40))}${RESET}`); i += 1; continue; }
    // blockquote — GitHub-style callouts get a colored label; plain quotes stay subtle
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      const callout = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i.exec(quote[1].trim());
      if (callout) {
        const kindWord = callout[1].toUpperCase();
        const color =
          kindWord === "NOTE" ? rgb(T.info) :
          kindWord === "TIP" ? rgb(T.green) :
          kindWord === "IMPORTANT" ? rgb([187, 154, 247] as const) :
          kindWord === "WARNING" ? rgb(T.yellow) : rgb(T.red);
        for (const w of wrapPlain(renderInline(callout[2]), Math.max(4, width - 4))) {
          out.push(`${C.quoteBar} ${color}\x1b[1m${kindWord}${RESET} ${w}`);
        }
        i += 1;
        continue;
      }
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
    // task lists (- [ ] / - [x]) — checkbox-styled rows, nested by indent
    const task = /^(\s*)([-*+])\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    if (task) {
      const depth = Math.floor(task[1].length / 2);
      const indent = "  ".repeat(depth);
      const doneTask = task[3].toLowerCase() === "x";
      const box = doneTask ? fgGreen("[x]") : fgMuted("[ ]");
      const text = renderInline(task[4]);
      for (const w of wrapPlain(text, Math.max(4, width - indent.length - 4))) {
        out.push(`${indent}${box} ${doneTask ? fgMuted(w) : w}`);
      }
      i += 1;
      continue;
    }
    // unordered lists (with nesting via indent)
    const ul = /^(\s*)([-*+])\s+(.*)$/.exec(line);
    if (ul) {
      const depth = Math.floor(ul[1].length / 2);
      const indent = "  ".repeat(depth);
      const bullet = depth === 0 ? fgAccent("•") : fgMuted("◦");
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
        out.push(`${indent}${fgAccent(ol[2] + ".")} ${w}`);
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

const KEYWORDS: Record<string, string> = {
  ts: "const let var function return if else for while import from export default async await try catch finally throw new class extends interface type enum public private readonly static switch case break continue typeof instanceof in of do yield delete void null undefined",
  js: "const let var function return if else for while import from export default async await try catch finally throw new class extends switch case break continue typeof instanceof in of do yield delete void null undefined",
  jsx: "const let var function return if else for while import from export default async await try catch finally throw new class extends interface type switch case break continue typeof instanceof in of do yield delete void null undefined",
  tsx: "const let var function return if else for while import from export default async await try catch finally throw new class extends interface type enum public private readonly static switch case break continue typeof instanceof in of do yield delete void null undefined",
  py: "def return if elif else for while import from as with try except finally raise lambda pass break continue in not and or is None True False class yield async await global nonlocal assert del print",
  sh: "if then else elif fi for while do done case esac function in return echo exit local export",
  bash: "if then else elif fi for while do done case esac function in return echo exit local export",
  zsh: "if then else elif fi for while do done case esac function in return echo exit local export",
  go: "func return if else for range switch case default break continue goto fallthrough select case struct interface map chan go defer recover panic var const type package import range",
  rs: "fn let mut const static if else match while for loop break continue return struct enum trait impl pub use mod crate super self where async await move box dyn ref",
  rust: "fn let mut const static if else match while for loop break continue return struct enum trait impl pub use mod crate super self where async await move box dyn ref",
  c: "int char float double void return if else for while do switch case default break continue static const struct union typedef enum sizeof malloc free include define",
  cpp: "int char float double void return if else for while do switch case default break continue static const struct union typedef enum public private protected class namespace template virtual override new delete auto using namespace",
  java: "int long float double boolean void return if else for while do switch case default break continue static final public private protected class interface extends implements new try catch finally throw throws package import",
  ruby: "def return if elsif else unless for while until case when break next redo in not and or class module end require include extend alias true false nil self yield begin rescue ensure",
  php: "function return if else elseif for while do switch case break continue echo print new class extends public private protected static interface namespace use try catch finally throw fn match true false null",
  sql: "select from where and or not insert into values update set delete create table index view join left right full inner outer on group by order having limit offset union all distinct as asc desc between like in is null true false",
  toml: "",
  json: "",
  yaml: "",
  md: "",
  markdown: "",
};
function highlightCode(line: string, lang: string): string {
  const source = stripAnsi(line);
  const kw = KEYWORDS[lang] ? new Set(KEYWORDS[lang].split(" ")) : null;
  // one literal regex: comments (// or #) · strings · numbers · words
  const tokenRe = /(\/\/[^\n]*|#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let out = "";
  let last = 0;
  for (const match of source.matchAll(tokenRe)) {
    const idx = match.index ?? 0;
    out += rgb(T.green) + source.slice(last, idx) + RESET;
    const [whole, comment, str, num, word] = match;
    if (comment !== undefined) out += fgMuted(comment);
    else if (str !== undefined) out += fgAmber(str);
    else if (num !== undefined) out += fgOrange(num);
    else if (word !== undefined) out += kw && kw.has(word) ? fgPurple(word) : rgb(T.green) + word + RESET;
    last = idx + whole.length;
  }
  out += rgb(T.green) + source.slice(last) + RESET;
  return out;
}

function renderCodeLine(line: string, width: number, lang = ""): string[] {
  const bare = stripAnsi(line);
  const inner = width; // code surface spans the full content width
  // a thin left gutter separates the code surface from the prose
  const gutter = `${rgb(T.panel3)}│${RESET}`;
  const bgLine = (content: string, visibleLen: number): string =>
    `${bgRgb(T.panel2)}${content}${" ".repeat(Math.max(0, inner - visibleLen))}${RESET}`;
  const pad = 2; // one gutter column + one space
  const limit = Math.max(4, inner - pad - 1); // gutter + leading space
  const tint = (piece: string): string => (lang ? highlightCode(piece, lang) : rgb(T.green) + escapeProse2(piece) + RESET);
  if (visibleWidth(bare) <= limit) {
    return [bgLine(`${gutter} ${tint(bare)}`, pad + 1 + visibleWidth(bare))];
  }
  // wrap long lines — preserve verbatim chars, and MARK the continuation
  // rows so a split line is never mistaken for two code lines
  const out: string[] = [];
  let rest = bare;
  let first = true;
  while (rest.length > 0) {
    const marker = first ? "" : `${fgMuted("↪")} `;
    const room = Math.max(1, limit - visibleWidth(marker));
    const chunk = graphemeSlice(rest, room);
    if (chunk.columns === 0) break;
    out.push(bgLine(`${gutter} ${marker}${tint(chunk.text)}`, pad + visibleWidth(marker) + 1 + chunk.columns));
    rest = rest.slice(chunk.consumed);
    first = false;
  }
  return out;
}

function escapeProse2(text: string): string {
  return stripAnsi(text);
}

import { graphemeSlice } from "./ansi";
function renderTable(block: string[], width: number): string[] {
  const rows = block.map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  if (rows.length < 2) return block;
  const [header, , ...body] = rows; // second row is the separator
  // narrow terminals (< 46 cols): stack key — value rows instead of a mangled grid
  if (width < 46) {
    const out: string[] = [];
    for (const row of body) {
      out.push(`${BOLD}${renderInline(row[0] ?? "")}${RESET}`);
      for (let j = 1; j < header.length; j++) {
        const label = header[j] ?? `col${j + 1}`;
        const value = row[j] ?? "";
        if (!value) continue;
        for (const w of wrapPlain(`${fgMuted(label + " —")} ${renderInline(value)}`, Math.max(4, width - 2))) out.push(`  ${w}`);
      }
      out.push("");
    }
    return out;
  }
  const cols = header.length;
  // measure the RENDERED cell (markdown becomes ANSI) — measuring the raw
  // source overshot every column containing **bold** or `code`
  const cellWidth = (text: string): number => visibleWidth(renderInline(text));
  const colWidths = header.map((h, i) => {
    const cells = [h, ...body.map((r) => r[i] ?? "")];
    return Math.min(60, Math.max(...cells.map((c) => cellWidth(c)), 3));
  });
  const sumCols = colWidths.reduce((a, b) => a + b, 0);
  const gridBudget = (ws: number[]): number => ws.reduce((a, b) => a + b, 0) + cols * 2 + 1;
  const scale = gridBudget(colWidths) > width ? (width - cols * 2 - 1) / Math.max(1, sumCols) : 1;
  const widths = colWidths.map((w) => Math.max(3, Math.floor(w * scale)));
  const rowWidth = Math.min(width, gridBudget(widths));
  const bar = `${rgb(T.muted)}${"─".repeat(Math.max(1, rowWidth))}${RESET}`;
  const out: string[] = [];
  const cell = (text: string, w: number) => {
    const rendered = renderInline(text);
    if (visibleWidth(rendered) <= w) {
      return rendered + " ".repeat(Math.max(0, w - visibleWidth(rendered)));
    }
    // shrink by rendered width, keep the escape sequences intact
    const clip = sliceToWidth(rendered, Math.max(1, w - 1)).text + "…";
    return clip + " ".repeat(Math.max(0, w - visibleWidth(clip)));
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
