// Ink theme tokens — opencode's Tokyo Night, hex strings for Ink <Text color=…>
export const C = {
  bg: "#1a1b26",
  panel: "#1e2030",
  panel2: "#222436",
  panel3: "#292e42",
  borderSubtle: "#545c7e",
  border: "#737aa2",
  borderActive: "#9099b2",
  text: "#c8d3f5",
  muted: "#828bb8",
  accent: "#82aaff",
  violet: "#c099ff",
  orange: "#ff966c",
  yellow: "#ffc777",
  green: "#c3e88d",
  cyan: "#86e1fc",
  red: "#ff757f",
  teal: "#4fd6be",
};

export function modeColor(mode: string): string {
  switch (mode) {
    case "plan":
      return C.yellow;
    case "build":
      return C.accent;
    case "compose":
      return C.violet;
    case "review":
      return C.cyan;
    case "yolo":
      return C.red;
    default:
      return C.muted;
  }
}
