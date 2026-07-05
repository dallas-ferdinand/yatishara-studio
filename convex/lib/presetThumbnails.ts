/** Image prompts for preset preview cards — cartoon families only. */
export const PRESET_THUMBNAIL_PROMPTS: Record<string, string> = {
  "toon-prime":
    "Traditional 2D cel animation still, medium consistent line weight, flat two-tone shading, warm domestic kitchen, two mugs on table, elderly cartoon hands, readable sitcom expression, stylized interior, 16:9, no text",
  "toon-adult":
    "Adult 2D cel animation still, sharper outlines, saturated ironic palette, exaggerated reaction pose, stylized domestic interior, snappy staging, 16:9, no text",
  "toon-surreal":
    "Original adult surreal 2D animation still, bold black outlines, thin lanky characters with large heads and scribble-pupil eyes in mundane suburban kitchen, cosmic aurora sky and miniature green landscape visible through doorway, flat cel colors, deadpan adult expressions, character and environment contrast, no named characters, no text, 16:9",
  "toon-family":
    "Soft family 2D animation still, rounded forms, pastel warm palette, gentle expressions, cozy living room, stylized cartoon staging, 16:9, no text",
  "toon-cgi":
    "Stylized 3D cartoon render still, matte toon shader, soft sculpted characters, rim-lit silhouettes, warm domestic set, non-photoreal CG, 16:9, no text",
  "toon-neon-idol":
    "Original polished 3D CGI animation still, stylish idol-action group in coordinated poses, neon pink and electric blue lighting, urban fantasy city night, glowing energy weapons, vibrant unnatural hair colors, tactical streetwear fashion, cinematic backlighting, no named characters, no text, 16:9",
};

export function presetThumbnailPrompt(slug: string, tagline: string, systemInstructions: string): string {
  return (
    PRESET_THUMBNAIL_PROMPTS[slug] ??
    `Representative cartoon preview still for ${tagline}. ${systemInstructions.slice(0, 120)}. 2D cel or stylized 3D, 16:9, no text, no logos.`
  );
}

export function presetStaticPreviewPath(slug: string): string {
  return `/presets/${slug}.webp`;
}
