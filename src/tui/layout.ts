import { visibleLength } from "../util/ansi";

export function wrapText(text: string, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    let line = raw;
    while (visibleLength(line) > width) {
      const slice = line.slice(0, width);
      const lastSpace = slice.lastIndexOf(" ");
      if (lastSpace > 0) {
        out.push(line.slice(0, lastSpace).trimEnd());
        line = line.slice(lastSpace).trimStart();
      } else {
        out.push(line.slice(0, width));
        line = line.slice(width);
      }
    }
    out.push(line);
  }
  return out;
}

export function matchCommands(input: string, commands: string[]): string[] {
  if (!input.startsWith("/") || input.includes(" ")) return [];
  const q = input.toLowerCase();
  return commands.filter((c) => c.startsWith(q));
}
