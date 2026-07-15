#!/usr/bin/env node
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

const FULL_SCENE = `## Full-scene style lock
Apply this look to the ENTIRE output frame — people, wardrobe, props, architecture, ground, foliage, sky, atmosphere, reflections, and lighting — as one coherent world. Never leave photographic backgrounds behind stylized characters. Never collage stylized subjects onto live-action environments.

## Visual reference policy
Use the attached sheet as STYLE EVIDENCE ONLY: transfer rendering, line/material treatment, lighting logic, palette behavior, contrast, and finish for every surface. Do not copy Dallas, Shara, their clothing, poses, rooftop layout, architecture, planters, skyline, or composition unless those subjects are independently requested or attached. User prompt and attached character/prop/location refs control content and identity. No text, logos, watermarks, or borders unless explicitly requested.`;

const styles = [
  {
    name: "Cinematic Anime",
    replaceId: "ks7a19q001k17nefp1h4zj4n218akxhk",
    file: "dallas-shara-style-scene-anime-v2.png",
    renderMode: "illustrated_2d",
    description:
      "Mature feature-film anime with precise linework, painted environments, and luminous cinematic color across characters and world.",
    styleRules: `# Cinematic Anime

- Mature hand-drawn anime feature-film finish; natural adult anatomy and recognizable faces.
- Precise confident linework; controlled two-to-three tone cel shading with subtle gradient accents.
- Richly painted environments — roofs, walls, plants, city lights, sky, and atmosphere must share the same anime rendering language as the characters.
- Keep silhouettes clean and motion readable.
- Avoid chibi, giant eyes, manga panels, speed lines, fan-art finish, photoreal skin, and leftover live-action backgrounds.

${FULL_SCENE}`,
  },
  {
    name: "Premium 2D Cel",
    replaceId: "ks701sdwfwgd78cvmhfv5vegrh8ajtgs",
    file: "dallas-shara-style-scene-cel-v2.png",
    renderMode: "illustrated_2d",
    description:
      "Clean Western feature-animation cel language with readable silhouettes and graphic color on characters and environment.",
    styleRules: `# Premium 2D Cel

- Western feature-animation quality with elegant economical linework and hand-drawn 2D forms.
- Graphic readable silhouettes; natural adult proportions; expressive but identity-faithful faces.
- Clean two-tone cel shading, selective rim light, cohesive production color script for set and people.
- Simplify environmental detail into designed shapes without leaving photographic texture.
- Avoid anime tropes, thick comic ink, photoreal textures, airbrushed gradients, and 3D forms.

${FULL_SCENE}`,
  },
  {
    name: "Stylized 3D Feature",
    replaceId: "ks79ehdpdvbx11vk40116gpqzx8akmrg",
    file: "dallas-shara-style-scene-disney-3d.png",
    renderMode: "illustrated_3d",
    description:
      "High-end stylized 3D animated-feature rendering with tactile materials and art-directed lighting across the whole set.",
    styleRules: `# Stylized 3D Feature

- Premium stylized 3D animated-feature finish with sophisticated adult character design.
- Softly modeled forms, tactile fabric/skin/hair, and art-directed global illumination on characters and architecture alike.
- Environment surfaces (ground, walls, plants, skyline, sky) must be sculpted CGI materials — never leftover photography.
- Use appealing shape language without caricaturing real people.
- Avoid plastic toy proportions, giant eyes, uncanny near-real faces, game-engine screenshots, and photoreal backgrounds.

${FULL_SCENE}`,
  },
  {
    name: "Watercolor Storybook",
    replaceId: "ks7ck279bkb2vej3vcmmyfwv7h8aks27",
    file: "dallas-shara-style-scene-watercolor-v2.png",
    renderMode: "illustrated_2d",
    description:
      "Elegant contemporary watercolor with graphite structure and transparent washes across people and place.",
    styleRules: `# Watercolor Storybook

- Contemporary editorial watercolor with fine graphite underdrawing and transparent layered washes.
- Keep faces and hero edges selectively crisp; allow pigment blooms in backgrounds and materials.
- Visible cold-press paper tooth must show in architecture, ground, and sky — not just on figures.
- Preserve natural adult anatomy and readable silhouettes.
- Avoid childish clip art, muddy faces, uncontrolled splatter, opaque digital gouache, photorealism, and 3D.

${FULL_SCENE}`,
  },
  {
    name: "Graphic Noir",
    replaceId: "ks777d70zp9srzanzdmxp010gs8akkya",
    file: "dallas-shara-style-scene-noir-v2.png",
    renderMode: "illustrated_2d",
    description:
      "Modern graphic-noir animation with geometric light, deep shadow masses, and selective color across the whole frame.",
    styleRules: `# Graphic Noir

- Modern graphic-noir animation: deep indigo/charcoal shadow masses with selective saturated accents.
- Sharp geometric lighting, crisp silhouettes, screenprint-like shapes for people and architecture.
- City, sky, ground, and plants must follow the same graphic value language as the characters.
- Faces remain readable and identity-faithful despite simplified value grouping.
- Avoid muddy detail, comic speech bubbles, photoreal textures, anime conventions, and 3D.

${FULL_SCENE}`,
  },
  {
    name: "Disney Cartoon 3D",
    replaceId: null,
    file: "dallas-shara-style-scene-disney-3d.png",
    renderMode: "illustrated_3d",
    description:
      "Theatrical Disney/Pixar-like cartoon 3D feature finish with appealing soft sculpting and cohesive world lighting.",
    styleRules: `# Disney Cartoon 3D

- Theatrical Disney/Pixar-like premium cartoon 3D animated-feature look.
- Appealing soft sculpted forms, subsurface skin, tactile wardrobe, and warmly art-directed global illumination.
- The full location — roof, walls, door, plants, city lights, mountains, sky — must read as stylized cartoon CGI, matching the characters.
- Keep adult proportions and recognizable identity; avoid chibi or toy-doll faces.
- Avoid photoreal photography, live-action background plates, uncanny near-real skin, and text.

${FULL_SCENE}`,
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

async function main() {
  // Update cinematic realism rules only (keep image)
  console.log("Updating Cinematic Realism rules...");
  await studioFetch(`/elements/ks7fbgvw4ph2khfwsv1b7sp7ch8aj7mr`, {
    method: "PATCH",
    body: JSON.stringify({
      description:
        "Premium live-action cinematic realism with natural Caribbean skin, tactile materials, blue-hour ambience, and restrained filmic color across the whole frame.",
      styleRules: `# Cinematic Realism

- Premium live-action photographic realism; never illustrated or CGI.
- Natural skin texture, anatomically accurate faces and hands, physically credible wardrobe and environments.
- Filmic dynamic range, motivated practical lighting, subtle atmospheric depth, restrained 35mm depth of field.
- Rich but natural color separation; clean highlights; detailed shadows without crushed blacks.
- Camera language: composed cinematic frames, realistic lenses, observable action rather than fashion posing.
- Avoid plastic skin, beauty-filter faces, HDR halos, oversaturation, fake film damage, and generic stock-photo polish.

${FULL_SCENE}`,
      renderMode: "photoreal",
    }),
  });

  for (const style of styles) {
    const assetId = await uploadImage(style.file, `${style.name.replace(/\s+/g, "-")}-fullscene.png`);
    console.log(`Creating style sheet: ${style.name}`);
    const created = await studioFetch("/elements", {
      method: "POST",
      body: JSON.stringify({
        type: "style_sheet",
        name: style.name,
        description: style.description,
        folderId,
        renderMode: style.renderMode,
        styleRules: style.styleRules,
        sheetAssetId: assetId,
      }),
    });
    const newId = created.element?.id ?? created.id ?? created._id;
    console.log(`  created ${newId}`);
    if (style.replaceId) {
      console.log(`  trashing old ${style.replaceId}`);
      await studioFetch(`/elements/${encodeURIComponent(style.replaceId)}`, {
        method: "DELETE",
      });
    }
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
