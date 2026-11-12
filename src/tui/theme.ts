// OpenCode's default "opencode" theme (dark) — XMINAL's single source for
// design tokens. Hex values match opencode v2's theme assets
// (packages/theme/src/tui/assets/v2/opencode.json) so the TUI looks identical.
//
// Layout rules that come with the theme (see docs/OPENCODE-ENGINE.md):
//   · the session column has 2 columns of side padding (1 below 44 cols)
//   · every left rule is the heavy vertical ┃ (U+2503)
//   · the composer closes with ╹ (U+2579) and a ▀ (U+2580) strip
export const rgb = (c: readonly [number, number, number]): string => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
export const bgRgb = (c: readonly [number, number, number]): string => `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;
export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const ITALIC = "\x1b[3m";
export const T = {
  bg: [10, 10, 10] as const,          // #0a0a0a background.base
  panel: [20, 20, 20] as const,       // #141414 background.raised.base
  panel2: [30, 30, 30] as const,      // #1e1e1e background.raised.high
  panel3: [76, 76, 76] as const,      // #4c4c4c background.raised.max
  composer: [30, 30, 30] as const,    // #1e1e1e prompt band (decrease of raised)
  borderSubtle: [72, 72, 72] as const,   // #484848 border.base
  border: [72, 72, 72] as const,         // #484848 border.base
  borderActive: [181, 181, 181] as const, // #b5b5b5 neutral.300
  text: [238, 238, 238] as const,     // #eeeeee text.base
  muted: [128, 128, 128] as const,    // #808080 text.muted
  accent: [92, 156, 245] as const,    // #5c9cf5 categorical blue (agent 0)
  violet: [157, 124, 216] as const,   // #9d7cd8 markdown.heading / categorical purple
  orange: [250, 178, 131] as const,   // #fab283 markdown.link / categorical orange
  yellow: [245, 167, 66] as const,    // #f5a742 feedback.warning
  green: [127, 216, 143] as const,    // #7fd88f feedback.success / categorical green
  cyan: [86, 182, 194] as const,      // #56b6c2 feedback.info
  red: [224, 108, 117] as const,      // #e06c75 feedback.error / categorical red
  teal: [79, 214, 190] as const,      // #4fd6be diff.text.added
  removed: [197, 59, 83] as const,    // #c53b53 diff.text.removed
  diffContext: [130, 139, 184] as const, // #828bb8 diff.text.context
  diffAddedBg: [32, 48, 59] as const,     // #20303b diff.background.added
  diffRemovedBg: [55, 34, 44] as const,   // #37222c diff.background.removed
  info: [86, 182, 194] as const,
  quote: [229, 192, 123] as const,     // #e5c07b markdown.blockQuote / emphasis
};
export const fgAccent = (t: string) => `${rgb(T.accent)}${t}${RESET}`;
export const fgAmber = (t: string) => `${rgb(T.yellow)}${t}${RESET}`;
export const fgGreen = (t: string) => `${rgb(T.green)}${t}${RESET}`;
export const fgPurple = (t: string) => `${rgb(T.violet)}${t}${RESET}`;
export const fgRed = (t: string) => `${rgb(T.red)}${t}${RESET}`;
export const fgMuted = (t: string) => `${rgb(T.muted)}${t}${RESET}`;
export const fgText = (t: string) => `${rgb(T.text)}${t}${RESET}`;
export const fgCyan = (t: string) => `${rgb(T.cyan)}${t}${RESET}`;
export const fgOrange = (t: string) => `${rgb(T.orange)}${t}${RESET}`;
export const fgYellow = (t: string) => `${rgb(T.yellow)}${t}${RESET}`;


/**
 * Agent (mode) colors — opencode assigns the categorical palette in order:
 * blue, purple, green, orange, red (theme.categorical, step 200).
 */
export function modeColor(mode: string): string {
  switch (mode) {
    case "build": return rgb(T.accent);
    case "plan": return rgb(T.violet);
    case "compose": return rgb(T.green);
    case "review": return rgb(T.orange);
    case "yolo": return rgb(T.red);
    default: return rgb(T.muted);
  }
}

/** Decrease a color toward background (used for composer tint + hover). */
function decrease(c: readonly [number, number, number], amount = 18): [number, number, number] {
  return [Math.max(0, c[0] - amount), Math.max(0, c[1] - amount), Math.max(0, c[2] - amount)];
}

/**
 * Re-apply a background after every reset.
 *
 * A bare ESC[0m clears the background too, so any styled text inside a
 * painted row (a panel, the composer, the sidebar) punched a hole in it.
 * Keeps the fill continuous.
 */
export function keepBg(bg: string, content: string): string {
  return content.includes(RESET) ? content.split(RESET).join(RESET + bg) : content;
}

export const inlineCode = (t: string) => `${bgRgb(T.panel2)}${rgb(T.green)} ${t} ${RESET}`;
