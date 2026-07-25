/** Cross-tree control for the layout PaintBoot overlay (single LogoLoader instance). */

export const PAINT_BOOT_CLAIM = "ys-paint-boot-claim";
export const PAINT_BOOT_DISMISS = "ys-paint-boot-dismiss";

export function claimPaintBoot(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PAINT_BOOT_CLAIM));
}

export function dismissPaintBoot(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PAINT_BOOT_DISMISS));
}
