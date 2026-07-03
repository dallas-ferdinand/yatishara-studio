/** Image prompts for preset preview cards — representative still frames, no text overlays. */
export const PRESET_THUMBNAIL_PROMPTS: Record<string, string> = {
  "story-ad":
    "Documentary-style kitchen table at morning, two ceramic mugs of tea, elderly hands resting near one cup, soft window light, quiet emotional mood, shallow depth of field, cinematic still frame, 16:9, no text",
  cinematic:
    "Cinematic film still, dramatic motivated lighting, shallow depth of field, anamorphic lens bokeh, moody color grade, woman silhouette in doorway, movie-quality composition, 16:9, no text",
  realism:
    "Ultra-realistic documentary photograph, natural daylight, authentic everyday living room, phone-camera realism, grounded textures, unposed human moment, 16:9, no text",
  "product-studio":
    "Premium commercial product photography, elegant skincare bottle on seamless white backdrop, soft studio lighting, clean reflections, hero product shot, 16:9, no text",
  "social-hook":
    "Bold vertical-friendly social media frame, vibrant colors, young creator mid-reaction scroll-stopping moment, punchy composition, TikTok aesthetic still, 16:9 crop, no text",
  hypermotion:
    "High-energy action sports still, motion blur, dynamic camera angle, whip-pan aesthetic, kinetic impact moment, saturated contrast, 16:9, no text",
  anime:
    "High-quality anime key visual still, vivid color palette, expressive character close-up, clean linework, stylized lighting, Japanese animation style, 16:9, no text",
  "3d-cgi":
    "Polished 3D CGI render still, soft global illumination, premium materials, futuristic product on pedestal, clean geometry, visualization quality, 16:9, no text",
  "footage-vfx":
    "Video frame split moment, ordinary street scene with subtle magical VFX transformation starting, practical visual effects, locked camera, 16:9, no text",
};

export function presetThumbnailPrompt(slug: string, tagline: string, systemInstructions: string): string {
  return (
    PRESET_THUMBNAIL_PROMPTS[slug] ??
    `Representative preview still for a ${tagline} creative preset. ${systemInstructions.slice(0, 120)}. 16:9 cinematic thumbnail, no text, no logos.`
  );
}

export function presetStaticPreviewPath(slug: string): string {
  return `/presets/${slug}.webp`;
}
