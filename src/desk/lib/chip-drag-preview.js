/** Shared chip-sized drag preview (file-manager style, not full-size media). */

function cleanupChipDragGhosts() {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".studio-chip-drag-ghost").forEach((el) => el.remove());
}

/**
 * Replace the browser's full-size drag ghost with a compact media/file chip.
 * @param {DataTransfer | null | undefined} dataTransfer
 * @param {{ label?: string, thumbnailUrl?: string | null, kind?: string | null }} opts
 */
export function setChipDragImage(dataTransfer, opts = {}) {
  if (!dataTransfer || typeof document === "undefined") return;
  cleanupChipDragGhosts();

  const label = String(opts.label ?? "Item").trim() || "Item";
  const thumb = typeof opts.thumbnailUrl === "string" ? opts.thumbnailUrl : "";
  const kind = String(opts.kind ?? "").toLowerCase();
  const isMedia = Boolean(thumb) && (kind === "image" || kind === "video" || !kind);

  const chip = document.createElement("div");
  chip.className = `studio-chip-drag-ghost${isMedia ? " is-media" : " is-file"}`;
  chip.setAttribute("aria-hidden", "true");

  if (isMedia) {
    const img = document.createElement("img");
    img.src = thumb;
    img.alt = "";
    img.draggable = false;
    chip.appendChild(img);
  } else {
    const name = document.createElement("span");
    name.className = "studio-chip-drag-ghost-label";
    name.textContent = label.length > 22 ? `${label.slice(0, 20)}…` : label;
    chip.appendChild(name);
  }

  document.body.appendChild(chip);
  const w = isMedia ? 72 : Math.min(180, chip.offsetWidth || 120);
  const h = isMedia ? 72 : 36;
  dataTransfer.setDragImage(chip, Math.round(w / 2), Math.round(h / 2));
  window.requestAnimationFrame(() => {
    // Keep one frame so setDragImage can capture, then remove.
    window.setTimeout(() => chip.remove(), 0);
  });
}
