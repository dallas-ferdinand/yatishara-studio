/**
 * Labels for the two halves after a split.
 * - "clip"     → "clip a", "clip b"
 * - "clip b"   → "clip b 1", "clip b 2"
 * - "clip b 1" → "clip b 1 a", "clip b 1 b"
 */
export function labelsForSplit(label: string): [string, string] {
  const trimmed = (label ?? "").trim() || "Clip";
  // Ends with a single letter suffix: deepen with numbers.
  if (/^.+\s+[a-z]$/i.test(trimmed)) {
    return [`${trimmed} 1`, `${trimmed} 2`];
  }
  // Ends with a number (or plain name): branch with letters.
  return [`${trimmed} a`, `${trimmed} b`];
}
