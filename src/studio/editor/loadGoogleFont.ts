const loaded = new Set<string>();
const loading = new Map<string, Promise<void>>();

function cssFamilyParam(family: string): string {
  return family.trim().replace(/\s+/g, "+");
}

/** Load a Google Font into the document (and optionally a worker FontFace set). */
export async function loadGoogleFont(
  family: string,
  weights: number[] = [400, 600, 700],
): Promise<void> {
  if (!family) return;
  if (loaded.has(family)) return;
  const inflight = loading.get(family);
  if (inflight) return inflight;
  if (typeof document === "undefined") return;
  const job = (async () => {
    const id = `gf-${cssFamilyParam(family).toLowerCase()}`;
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      const wght = weights.join(";");
      link.href = `https://fonts.googleapis.com/css2?family=${cssFamilyParam(family)}:wght@${wght}&display=swap`;
      document.head.appendChild(link);
    }
    await document.fonts.load(`400 16px "${family}"`).catch(() => undefined);
    await document.fonts.load(`600 42px "${family}"`).catch(() => undefined);
    await document.fonts.load(`700 42px "${family}"`).catch(() => undefined);
    loaded.add(family);
  })();
  loading.set(family, job);
  try {
    await job;
  } finally {
    loading.delete(family);
  }
}

export function isLegacySystemFont(family: string | undefined): boolean {
  return (
    !family ||
    family === "system" ||
    family === "sans" ||
    family === "serif" ||
    family === "mono" ||
    family === "display"
  );
}
