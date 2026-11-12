/**
 * Terminal width — see `./ansi.ts`, which is the single implementation.
 *
 * This module keeps the exports the rest of the codebase already imports.
 */
export {
  stripAnsi,
  splitGraphemes,
  graphemeWidth,
  visibleWidth,
  graphemeSlice,
  truncateToWidth,
  wrapAnsi,
  sliceToWidth,
  ansiAwareWidth,
  wrapAnsiByWidth,
  hasAnsi,
} from "./ansi";

export type { SliceResult } from "./ansi";

// The markdown renderer used to re-implement grapheme slicing; it now uses
// this module. The old `graphemeSliceToWidth` name stays for compatibility.
import { graphemeSlice } from "./ansi";
export function graphemeSliceToWidth(text: string, maxWidth: number) {
  const slice = graphemeSlice(text, maxWidth);
  return { text: String(slice), columns: slice.columns, consumed: slice.consumed };
}


