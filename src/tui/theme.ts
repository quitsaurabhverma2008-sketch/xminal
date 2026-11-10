// opencode Tokyo Night palette — XMINAL's single source for design tokens.
// Hex values match opencode's tokyo-night theme (their DEFAULT_THEMES.tokyonight).
export const rgb = (c: readonly [number, number, number]): string => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
export const bgRgb = (c: readonly [number, number, number]): string => `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;
export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const ITALIC = "\x1b[3m";
export const T = {
  bg: [26, 27, 38] as const,          // #1a1b26
  panel: [30, 32, 48] as const,       // #1e2030 backgroundPanel / raised
  panel2: [34, 36, 54] as const,      // #222436 backgroundElement
  panel3: [41, 46, 66] as const,      // #292e42
  composer: [24, 25, 37] as const,    // decreased raised — composer fill
  borderSubtle: [84, 92, 126] as const,   // #545c7e
  border: [115, 122, 162] as const,       // #737aa2
  borderActive: [144, 153, 178] as const, // #9099b2
  text: [200, 211, 245] as const,     // #c8d3f5
  muted: [130, 139, 184] as const,    // #828bb8
  accent: [130, 170, 255] as const,   // #82aaff primary
  violet: [192, 153, 255] as const,   // #c099ff secondary / keyword
  orange: [255, 150, 108] as const,   // #ff966c accent / number
  yellow: [255, 199, 119] as const,   // #ffc777 warning
  green: [195, 232, 141] as const,    // #c3e88d success / string
  cyan: [134, 225, 252] as const,     // #86e1fc operator / link
  red: [255, 117, 127] as const,      // #ff757f error
  teal: [79, 214, 190] as const,      // #4fd6be diffAdded
  removed: [197, 59, 83] as const,    // #c53b53 diffRemoved
  diffAddedBg: [32, 48, 59] as const,     // #20303b
  diffRemovedBg: [55, 34, 44] as const,   // #37222c
  info: [130, 170, 255] as const,
};
export const fgAccent = (t: string) => `${rgb(T.accent)}${t}${RESET}`;
export const fgAccent2 = (t: string) => `${rgb(T.cyan)}${t}${RESET}`;
export const fgAmber = (t: string) => `${rgb(T.yellow)}${t}${RESET}`;
export const fgGreen = (t: string) => `${rgb(T.green)}${t}${RESET}`;
export const fgPurple = (t: string) => `${rgb(T.violet)}${t}${RESET}`;
export const fgRed = (t: string) => `${rgb(T.red)}${t}${RESET}`;
export const fgMuted = (t: string) => `${rgb(T.muted)}${t}${RESET}`;
export const fgText = (t: string) => `${rgb(T.text)}${t}${RESET}`;
export const fgInfo = (t: string) => `${rgb(T.info)}${t}${RESET}`;
export const fgCyan = (t: string) => `${rgb(T.cyan)}${t}${RESET}`;
export const fgOrange = (t: string) => `${rgb(T.orange)}${t}${RESET}`;
export const fgYellow = (t: string) => `${rgb(T.yellow)}${t}${RESET}`;

export const fgSuccess = fgGreen;
export const fgWarning = fgAmber;
export const fgError = fgRed;

/** Mode (agent) colors — build is XMINAL's primary agent color. */
export function modeColor(mode: string): string {
  switch (mode) {
    case "plan": return rgb(T.yellow);
    case "build": return rgb(T.accent);
    case "compose": return rgb(T.violet);
    case "review": return rgb(T.cyan);
    case "yolo": return rgb(T.red);
    default: return rgb(T.muted);
  }
}

/** Decrease a color toward background (used for composer tint + hover). */
export function decrease(c: readonly [number, number, number], amount = 18): [number, number, number] {
  return [Math.max(0, c[0] - amount), Math.max(0, c[1] - amount), Math.max(0, c[2] - amount)];
}

export const inlineCode = (t: string) => `${bgRgb(T.panel2)}${rgb(T.green)} ${t} ${RESET}`;
