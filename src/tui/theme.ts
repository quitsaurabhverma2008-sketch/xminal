// Tokyo Night palette — single source for TUI design tokens.
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
  accent: [122, 162, 247] as const,
  amber: [224, 175, 104] as const,
  green: [158, 206, 106] as const,
  red: [247, 118, 142] as const,
};
export const fgAccent = (t: string) => `${rgb(T.accent)}${t}${RESET}`;
export const fgAmber = (t: string) => `${rgb(T.amber)}${t}${RESET}`;
export const fgGreen = (t: string) => `${rgb(T.green)}${t}${RESET}`;
export const fgRed = (t: string) => `${rgb(T.red)}${t}${RESET}`;
export const fgMuted = (t: string) => `${rgb(T.muted)}${t}${RESET}`;
export const fgText = (t: string) => `${rgb(T.text)}${t}${RESET}`;
export const inlineCode = (t: string) => `${bgRgb(T.panel2)}${rgb(T.accent)} ${t} ${RESET}`;
