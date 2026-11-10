// Tokyo Night palette — single source for TUI design tokens.
// Semantic colors: use fgSuccess/fgWarning/fgError/fgInfo instead of raw palette.
export const rgb = (c: readonly [number, number, number]): string => `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
export const bgRgb = (c: readonly [number, number, number]): string => `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;
export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const ITALIC = "\x1b[3m";
export const T = {
  bg: [16, 17, 20] as const,
  panel: [27, 29, 34] as const,
  panel2: [35, 38, 45] as const,
  border: [56, 59, 68] as const,
  text: [230, 232, 236] as const,
  muted: [139, 143, 153] as const,
  accent: [110, 168, 254] as const,
  accent2: [134, 225, 252] as const,
  amber: [224, 179, 65] as const,
  green: [158, 206, 106] as const,
  red: [247, 118, 142] as const,
  info: [130, 180, 255] as const,
};
export const fgAccent = (t: string) => `${rgb(T.accent)}${t}${RESET}`;
export const fgAccent2 = (t: string) => `${rgb(T.accent2)}${t}${RESET}`;
export const fgAmber = (t: string) => `${rgb(T.amber)}${t}${RESET}`;
export const fgGreen = (t: string) => `${rgb(T.green)}${t}${RESET}`;
export const fgPurple = (t: string) => `${rgb([187, 154, 247])}${t}${RESET}`;
export const fgRed = (t: string) => `${rgb(T.red)}${t}${RESET}`;
export const fgMuted = (t: string) => `${rgb(T.muted)}${t}${RESET}`;
export const fgText = (t: string) => `${rgb(T.text)}${t}${RESET}`;

export const fgSuccess = fgGreen;
export const fgWarning = fgAmber;
export const fgError = fgRed;
export const fgInfo = (t: string) => `${rgb(T.info)}${t}${RESET}`;

/** Mode pill colors — used by the status bar. */
export function modeColor(mode: string): string {
  switch (mode) {
    case "plan": return rgb(T.amber);
    case "build": return rgb(T.accent);
    case "compose": return rgb([187, 154, 247] as const);
    case "review": return rgb(T.accent2);
    case "yolo": return rgb(T.red);
    default: return rgb(T.muted);
  }
}

export const inlineCode = (t: string) => `${bgRgb(T.panel2)}${rgb(T.accent)} ${t} ${RESET}`;
