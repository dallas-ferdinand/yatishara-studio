/** Merge streaming token deltas / full snapshots without duplicating text. */
export function mergeStreamingText(prev, delta) {
  const p = String(prev ?? "");
  const d = String(delta ?? "");
  if (!d) return p;
  if (!p) return d;
  if (d === p) return p;
  if (d.startsWith(p)) return d;
  if (p.startsWith(d)) return p;
  if (p.endsWith(d)) return p;
  if (d.endsWith(p) && d.length > p.length) return d;
  if (d.length > p.length && d.includes(p.slice(0, Math.min(48, p.length)))) return d;
  if (p.length > d.length && p.includes(d.slice(0, Math.min(48, d.length)))) return p;
  const dTrim = d.trimStart();
  const pTrim = p.trim();
  if (d.length > p.length * 1.12 && dTrim.length > 20) {
    const probe = pTrim.slice(0, Math.min(20, pTrim.length));
    if (probe.length >= 8 && !d.includes(probe) && /^[A-Z#*]/.test(dTrim)) return d;
  }
  return `${p}${d}`;
}
