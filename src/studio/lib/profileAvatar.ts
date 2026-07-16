/** Distinct hue per A–Z for avatar letter gradients. */
const LETTER_COLORS = [
  "#FF5C7A", // A
  "#FF7A45", // B
  "#FFA03A", // C
  "#FFD13A", // D
  "#C6F04A", // E
  "#6EEF6A", // F
  "#2ED9A0", // G
  "#22C7C2", // H
  "#3DB8FF", // I
  "#4A8CFF", // J
  "#6B6BFF", // K
  "#8B5CFF", // L
  "#B85CFF", // M
  "#E055D8", // N
  "#FF4FA8", // O
  "#FF5C7A", // P
  "#FF8A4A", // Q
  "#F0C040", // R
  "#9AD84A", // S
  "#45D98A", // T
  "#2CC4C8", // U
  "#4A9BFF", // V
  "#6A72FF", // W
  "#9A5CFF", // X
  "#D45CFF", // Y
  "#FF4F8A", // Z
] as const;

export function letterColor(letter: string): string {
  const ch = String(letter ?? "")
    .trim()
    .charAt(0)
    .toUpperCase();
  if (ch < "A" || ch > "Z") return "#7A8494";
  return LETTER_COLORS[ch.charCodeAt(0) - 65] ?? "#7A8494";
}

/** Display-name initials first; otherwise first + last name. Never username. */
export function profileNameInitials({
  firstName,
  lastName,
  name,
  displayName,
}: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  displayName?: string | null;
} = {}): string {
  const display = String(displayName ?? "").trim();
  if (display) {
    const parts = display.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return display[0].toUpperCase();
  }
  const first = String(firstName ?? "").trim();
  const last = String(lastName ?? "").trim();
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  if (first) return first[0].toUpperCase();
  if (last) return last[0].toUpperCase();
  const fallback = String(name ?? "").trim();
  if (fallback) {
    const parts = fallback.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return fallback[0].toUpperCase();
  }
  return "?";
}

export function profileAvatarGradient(initials: string): string {
  const text = String(initials || "?").trim().toUpperCase() || "?";
  const a = letterColor(text[0] ?? "?");
  const b = letterColor(text[1] ?? text[0] ?? "?");
  if (text.length < 2 || a === b) {
    return `linear-gradient(145deg, color-mix(in srgb, ${a} 62%, #ffffff) 0%, ${a} 48%, color-mix(in srgb, ${a} 52%, #111827) 100%)`;
  }
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export function profileAvatarStyle(initials: string): {
  background: string;
  color: string;
} {
  return {
    background: profileAvatarGradient(initials),
    color: "#ffffff",
  };
}
