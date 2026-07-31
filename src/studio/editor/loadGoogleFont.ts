const loaded = new Set<string>();

function cssFamilyParam(family: string): string {
  return family.trim().replace(/\s+/g, "+");
}

/** Load a Google Font into the document (and optionally a worker FontFace set). */
export async function loadGoogleFont(
  family: string,
  weights: number[] = [400, 600, 700],
): Promise<void> {
  if (!family || loaded.has(family)) {
    if (family && typeof document !== "undefined") {
      await document.fonts.load(`600 42px "${family}"`).catch(() => undefined);
    }
    return;
  }
  if (typeof document === "undefined") return;
  const id = `gf-${cssFamilyParam(family).toLowerCase()}`;
  if (!document.getElementById(id)) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    const wght = weights.join(";");
    link.href = `https://fonts.googleapis.com/css2?family=${cssFamilyParam(family)}:wght@${wght}&display=swap`;
    document.head.appendChild(link);
  }
  loaded.add(family);
  await document.fonts.load(`400 16px "${family}"`).catch(() => undefined);
  await document.fonts.load(`600 42px "${family}"`).catch(() => undefined);
  await document.fonts.load(`700 42px "${family}"`).catch(() => undefined);
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
