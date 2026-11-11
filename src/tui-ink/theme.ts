// Ink theme tokens — opencode's default dark theme, hex strings for Ink <Text color=…>
export const C = {
  bg: "#0a0a0a",
  panel: "#141414",
  panel2: "#1e1e1e",
  panel3: "#4c4c4c",
  borderSubtle: "#484848",
  border: "#484848",
  borderActive: "#b5b5b5",
  text: "#eeeeee",
  muted: "#808080",
  accent: "#5c9cf5",
  violet: "#9d7cd8",
  orange: "#fab283",
  yellow: "#f5a742",
  green: "#7fd88f",
  cyan: "#56b6c2",
  red: "#e06c75",
  teal: "#4fd6be",
};

export function modeColor(mode: string): string {
  switch (mode) {
    case "build":
      return C.accent;
    case "plan":
      return C.violet;
    case "compose":
      return C.green;
    case "review":
      return C.orange;
    case "yolo":
      return C.red;
    default:
      return C.muted;
  }
}
