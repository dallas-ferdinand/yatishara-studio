# Studio wallpapers v1 (archived)

**Archived:** 2026-07-03  
**Reason:** Replaced with photorealistic cinematic scene backgrounds generated at true 4K (3840×2160).

These assets were the original Studio chat backgrounds. They were labeled `-4k` but were actually **1536×1024** WebP files with aggressive compression. They looked soft on 1440p+ displays.

## Contents

- `studio-scene-*-4k.webp` — theme scene backgrounds (worlds pack)
- `studio-space-*-4k.webp` — space/minimal variants (removed from UI)
- `studio-bg-*-4k.webp` — space pack alternates (removed from UI)
- `studio-empty-space-4k.webp` — default empty space fallback

## Replacement

New scene files live in `/public/studio-scene-*-4k.webp` (3840×2160, illustrated cartoon matte-painting backgrounds).

Background pack options are now **Scenes** (illustrated cartoon wallpaper) and **Clean** (no image).

## Regenerating (Cursor image gen only)

1. Generate PNGs with **Cursor image gen** into `assets/` (see prompts in `scripts/studio-wallpaper-prompts.mjs`)
2. Run `node scripts/process-studio-wallpapers.mjs all` to upscale to 4K WebP in `public/`

Do **not** use Studio/Vercel API for wallpaper regen — Cursor image gen only.
