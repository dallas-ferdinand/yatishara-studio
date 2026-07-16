#!/usr/bin/env node
/**
 * Registers distinct cartoon *worlds* (not soft filters).
 * Names are brand-safe. Each style must remake subjects into that production grammar.
 */
import fs from "node:fs";
import path from "node:path";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

loadEnv("/opt/yatishara-studio/_system/env/studio-mcp.env");
loadEnv("/opt/yatishara-studio/.env.local");

const apiKey = process.env.STUDIO_API_KEY;
const apiUrl = (process.env.STUDIO_API_URL ?? "").replace(/\/$/, "");
const folderId = "kx7f6ktqjszhpe6a0xej6w5k0h8ajqyt";
const assetsDir = "/root/.cursor/projects/opt-yatishara-studio/assets";

if (!apiKey || !apiUrl) {
  console.error("Missing STUDIO_API_KEY or STUDIO_API_URL");
  process.exit(1);
}

const REMAKE = `## Remake lock (not a filter)
Fully reimagine every person, prop, garment, vehicle, building, ground, plant, and sky as if produced inside this cartoon world. Change proportions, line language, material logic, and environment design so the frame looks native to that production — never a photographic base with a light theme wash. Preserve identity cues from user refs when provided, but convert form language completely.

## Full-scene style lock
Apply this world grammar to the ENTIRE frame. Never leave live-action or photoreal backgrounds behind stylized characters. Never collage mismatched mediums.

## Visual reference policy
If a sheet image is attached, use it as STYLE EVIDENCE ONLY: transfer rendering grammar, not specific people, wardrobe, poses, or location layout. User prompt and attached character/prop/location refs control content and identity. No text, logos, watermarks, or borders unless explicitly requested. Never name or imitate trademarked franchise characters.`;

const REALISM_LOCK = `## Full-scene realism lock
Keep every person, prop, garment, vehicle, building, ground, plant, and sky inside one physically credible live-action world. Preserve natural anatomy, real materials, coherent perspective, and motivated light across the entire frame. Never introduce cartoon proportions, illustration, cel shading, or stylized CGI.

## Visual reference policy
If a sheet image is attached, use it as photographic quality evidence only: transfer natural material response, lighting logic, dynamic range, and filmic finish, not specific people, wardrobe, poses, or location layout. User prompt and attached character/prop/location refs control content and identity. No text, logos, watermarks, or borders unless explicitly requested.`;

/** Legacy / soft-effect sheets to remove from the desk. */
const TRASH_IDS = [
  "ks74v8g43tsfkcg1vg3t33mq1s8aj2ya", // Premium 2D Cel
  "ks711g0jz8n11g8tezzwx4gxk18ajr9r", // Stylized 3D Feature
  "ks7101tcw75x20tnnwsn5vghax8ak9z3", // Watercolor Storybook
  "ks7bg81gamhv7sswq498f3z7t18akmx2", // Graphic Noir
  "ks7d9h59kgkgeb0kqe4wjr80hn8ajapp", // Disney Cartoon 3D
  "ks78axrwm3e97xxs778dj8syb58ajp4c", // Cinematic Anime (replaced below)
];

const styles = [
  {
    name: "Primetime",
    file: "style-world-primetime.png",
    renderMode: "illustrated_2d",
    description:
      "Flat American primetime sitcom cartoon world — bold outlines, simple shapes, limited cel shades.",
    styleRules: `# Primetime

World: US adult primetime sitcom cartoon grammar (original designs only — no franchise characters or logos).

- Rebuild every figure as a flat 2D TV-cartoon person: oversized round eyes with simple pupils, small nose, overbite mouth options, four-finger hands, thick black outlines, and nearly no facial microstructure.
- Skin fills are flat, limited, and slightly unnatural (warm yellow-ochre family tones are welcome when identity allows); clothing is graphic flat color with 1–2 shade steps max.
- Environments are simplified graphic sets — suburban houses, kitchens, sidewalks, sky as flat bands or simple clouds — painted as designed cartoons, never photos.
- Shadows are hard graphic shapes or absent; refuse gradients, airbrush, photoreal texture, anime eyes, and soft cinematic lighting.
- Camera read: clear staged sitcom framing; humor comes from poses and staging, not photoreal detail.

${REMAKE}`,
  },
  {
    name: "Cutaway",
    file: "style-world-cutaway-v2.png",
    renderMode: "illustrated_2d",
    description:
      "Bold adult cutaway sitcom cartoon world — thicker ink, busier sets, punchy limited color.",
    styleRules: `# Cutaway

World: Original adult American cutaway-sitcom cartoon grammar; no franchise characters, logos, or trademarked designs.

- Completely redesign people as bold TV-cartoon characters: large geometric heads, tiny dot pupils in simple white eyes, prominent angular noses and jaws, broad simplified torsos, narrow simplified limbs, four-finger hands, and highly readable exaggerated expressions.
- Use heavy uniform black ink contours and clean internal lines. Flat vector-like color fills only, with at most one hard-edged shadow shape. No realistic facial planes, musculature, pores, gradients, painterly rendering, or photographic anatomy.
- Simplify wardrobe into graphic shape blocks while retaining requested color identity.
- Redesign the entire environment as a gag-ready drawn set: simplified perspective, outlined architecture and props, flat cloud shapes, and graphic reflections. No photo texture anywhere.
- Keep a distinctly different silhouette language from rounded primetime cartoons: more angular faces, heavier jaws, busier set detail, and sharper comic posing.
- Avoid anime, classic feature softness, soft-sculpt 3D, realism, and merely tracing the source photograph.

${REMAKE}`,
  },
  {
    name: "Ink Classic",
    file: "style-world-ink-classic-v2.png",
    renderMode: "illustrated_2d",
    description:
      "Classic theatrical ink-and-paint 2D feature world — elegant line, soft painted sets.",
    styleRules: `# Ink Classic

World: Original classic theatrical hand-inked 2D feature-animation grammar; no franchise characters, logos, or trademarked designs.

- Completely redesign people as elegant hand-drawn feature characters: graceful curved silhouettes, expressive larger eyes and brows, simplified appealing noses and mouths, gently exaggerated hands, clean rhythmic gesture lines, and staged acting poses with anticipation.
- Use lively variable-width ink contours, clean opaque painted character fills, and only gentle two-tone cel shadows. No realistic facial planes, pores, photographic anatomy, digital airbrush, or traced-photo stiffness.
- Preserve recognizable identity cues while converting all forms to a classic animation model-sheet language.
- Repaint the entire environment as a designed multiplane background: hand-painted gouache/watercolor sky, simplified architecture, softly designed foliage, painted reflections, and atmospheric depth. Every surface must look illustrated.
- Visual distinction: lyrical curved line, warm storybook color scripting, theatrical character appeal, and painted background depth — never flat sitcom vector art, anime angularity, or 3D materials.

${REMAKE}`,
  },
  {
    name: "Soft 3D",
    file: "style-world-soft-3d.png",
    renderMode: "illustrated_3d",
    description:
      "Theatrical soft-sculpt 3D feature world — appealing forms, tactile materials, art-directed light.",
    styleRules: `# Soft 3D

World: Premium theatrical soft-sculpt 3D animated-feature grammar (original designs only — no franchise characters or logos).

- Rebuild every subject as appealing sculpted CGI: rounded forms, subsurface skin, tactile fabric/hair, and cohesive global illumination across the whole set.
- Character design stays adult and identity-aware, but shape language is feature-animation (not toy-chibi, not uncanny near-real).
- Environments must be built as matching CGI materials — grounds, walls, foliage, sky — never leftover photography.
- Lighting is warm art-directed theatrical light; materials respond physically inside a stylized world.
- Avoid 2D ink outlines, primetime sitcom flatness, anime cel shading, game-engine grit, and photoreal human skin pores.

${REMAKE}`,
  },
  {
    name: "Anime",
    file: "style-world-anime-v2.png",
    renderMode: "illustrated_2d",
    description:
      "Mature anime feature world — precise line, cel shade, fully painted environments.",
    styleRules: `# Anime

World: Original mature Japanese animated feature-film grammar; no franchise characters, logos, or trademarked designs.

- Completely redesign people as production-ready anime characters: clean angular facial construction, simplified nose and mouth marks, expressive proportional eyes, graphic hair masses with controlled strand groups, elegant adult anatomy, and decisive animation key poses.
- Use precise variable linework, flat local colors, and exactly two or three hard-edged cel-shade values. No realistic facial modeling, pores, photographic gradients, painterly skin, or traced-photo anatomy.
- Preserve recognizable identity cues while translating all forms into a consistent anime model-sheet language.
- Repaint the entire environment as a richly authored anime background: designed architecture, hand-painted cloud masses, luminous window patterns, graphic foliage, and stylized reflections with deliberate color scripting. Nothing may remain photographic.
- Visual distinction: mature anime facial geometry, controlled cel shadows, precise line economy, and cinematic painted environments — never Western sitcom anatomy, classic feature roundness, or 3D CGI.

${REMAKE}`,
  },
];

async function studioFetch(pathname, init = {}) {
  const response = await fetch(`${apiUrl}/api/v1${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `HTTP ${response.status}`);
  }
  return data;
}

async function uploadImage(file, name) {
  const full = path.join(assetsDir, file);
  const dataBase64 = fs.readFileSync(full).toString("base64");
  console.log(`Uploading ${name} (${Math.round(dataBase64.length / 1024)} KB b64)...`);
  const result = await studioFetch("/assets/upload-inline", {
    method: "POST",
    body: JSON.stringify({
      folderId,
      name,
      kind: "image",
      mimeType: "image/png",
      dataBase64,
    }),
  });
  const assetId = result.asset?.id ?? result.assetId ?? result.id;
  if (!assetId) throw new Error(`Upload missing asset id: ${JSON.stringify(result).slice(0, 200)}`);
  console.log(`  -> ${assetId}`);
  return assetId;
}

async function trashElement(id) {
  try {
    await studioFetch(`/elements/${encodeURIComponent(id)}`, { method: "DELETE" });
    console.log(`Trashed ${id}`);
  } catch (error) {
    console.warn(`Trash skipped ${id}: ${error.message}`);
  }
}

async function main() {
  console.log("Updating Realism rules (keep sheet)...");
  await studioFetch(`/elements/ks7fbgvw4ph2khfwsv1b7sp7ch8aj7mr`, {
    method: "PATCH",
    body: JSON.stringify({
      name: "Realism",
      description:
        "Premium live-action cinematic realism — natural materials, filmic light, no cartoon rebuild.",
      styleRules: `# Realism

World: Live-action photographic realism only.

- Keep anatomically accurate people, real materials, and physically credible environments.
- Filmic dynamic range, motivated practical lighting, subtle atmosphere, restrained depth of field.
- Do NOT convert into cartoons, anime, cel shading, or stylized CGI.
- Avoid plastic skin, beauty-filter faces, HDR halos, and stock-photo polish.

${REALISM_LOCK}`,
      renderMode: "photoreal",
    }),
  });

  console.log("Trashing legacy style sheets...");
  for (const id of TRASH_IDS) {
    await trashElement(id);
  }

  // Also trash any remaining sheets whose names match the retired catalog.
  const listedBefore = await studioFetch("/style-sheets");
  const before = listedBefore.styleSheets ?? listedBefore;
  const keepNames = new Set(["primetime", "cutaway", "ink classic", "soft 3d", "anime", "realism"]);
  for (const sheet of Array.isArray(before) ? before : []) {
    const key = String(sheet.name ?? "").trim().toLowerCase();
    if (!keepNames.has(key) && sheet.id !== "ks7fbgvw4ph2khfwsv1b7sp7ch8aj7mr") {
      await trashElement(sheet.id);
    }
  }

  const listedAfterTrash = await studioFetch("/style-sheets");
  const activeByName = new Map(
    (listedAfterTrash.styleSheets ?? listedAfterTrash).map((sheet) => [
      String(sheet.name ?? "").trim().toLowerCase(),
      sheet,
    ]),
  );

  for (const style of styles) {
    const sheetAssetId = await uploadImage(
      style.file,
      `${style.name.replace(/\s+/g, "-")}-world.png`,
    );
    const existing = activeByName.get(style.name.toLowerCase());
    console.log(`${existing ? "Replacing" : "Creating"} style sheet: ${style.name}`);
    const body = {
      type: "style_sheet",
      name: style.name,
      description: style.description,
      folderId,
      renderMode: style.renderMode,
      styleRules: style.styleRules,
      sheetAssetId,
    };
    // The public PATCH endpoint intentionally cannot replace a built sheet asset.
    // Create the complete replacement first, then trash the previous sheet.
    const saved = await studioFetch("/elements", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const savedId = saved.element?.id ?? saved.id ?? saved._id;
    console.log(`  saved ${savedId}`);
    if (existing) await trashElement(existing.id);
  }

  const listed = await studioFetch("/style-sheets");
  const sheets = listed.styleSheets ?? listed;
  console.log("\nActive style sheets:");
  for (const sheet of Array.isArray(sheets) ? sheets : []) {
    console.log(`- ${sheet.name} (${sheet.id}) built=${sheet.buildStatus}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
