import type { NextRequest } from "next/server";

export const PREVIEW_GATE_COOKIE = "studio_preview_gate";
export const PREVIEW_GATE_PATH = "/preview-gate";
export const PREVIEW_HOST = "preview.studio.yatishara.com";

export function previewGatePassword(): string | undefined {
  return process.env.PREVIEW_STUDIO_PASSWORD;
}

export function isPreviewHost(host: string | null): boolean {
  return (host ?? "").split(":")[0] === PREVIEW_HOST;
}

export async function previewGateToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`yatishara-studio-preview:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hasPreviewGateCookie(request: NextRequest): Promise<boolean> {
  const password = previewGatePassword();
  if (!password) return false;
  const cookie = request.cookies.get(PREVIEW_GATE_COOKIE)?.value;
  return cookie === (await previewGateToken(password));
}
