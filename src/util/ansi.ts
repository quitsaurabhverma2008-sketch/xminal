function colorsEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== null) return false;
  return process.env.TERM !== "dumb";
}

function wrap(open: number, close: number) {
  return (text: string): string => (colorsEnabled() ? `\u001b[${open}m${text}\u001b[${close}m` : text);
}

export const ansi = {
  get enabled(): boolean {
    return colorsEnabled();
  },
  reset: "\u001b[0m",
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  underline: wrap(4, 24),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  white: wrap(37, 39),
  gray: wrap(90, 39),
  bgBlue: wrap(44, 49),
  bgMagenta: wrap(45, 49),
  get clearLine(): string {
    return colorsEnabled() ? "\r\u001b[2K" : "\r";
  },
  get hideCursor(): string {
    return colorsEnabled() ? "\u001b[?25l" : "";
  },
  get showCursor(): string {
    return colorsEnabled() ? "\u001b[?25h" : "";
  },
  get altScreen(): string {
    return colorsEnabled() ? "\u001b[?1049h" : "";
  },
  get mainScreen(): string {
    return colorsEnabled() ? "\u001b[?1049l" : "";
  },
};

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

export function pad(text: string, width: number, align: "left" | "right" = "left"): string {
  const diff = Math.max(0, width - visibleLength(text));
  return align === "left" ? text + " ".repeat(diff) : " ".repeat(diff) + text;
}

export function truncate(text: string, width: number): string {
  if (visibleLength(text) <= width) return text;
  return text.slice(0, Math.max(0, width - 1)) + "…";
}

export const WORDMARK: string[] = [
  "██╗  ██╗███╗   ███╗██╗███╗   ██╗ █████╗ ██╗",
  "╚██╗██╔╝████╗ ████║██║████╗  ██║██╔══██╗██║",
  " ╚███╔╝ ██╔████╔██║██║██╔██╗ ██║███████║██║",
  " ██╔██╗ ██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║",
  "██╔╝ ██╗██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗",
  "╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝",
];

export function banner(version: string): string {
  return `${ansi.cyan(WORDMARK.join("\n"))}\n${ansi.gray(`v${version} · all-in-one terminal coding agent · /help for commands`)}`;
}
