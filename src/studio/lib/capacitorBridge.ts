"use client";

type ListenerHandle = { remove: () => Promise<void> };
type PluginMethod = (options?: Record<string, unknown>) => Promise<unknown>;
type CapacitorPlugin = Record<string, PluginMethod> & {
  addListener?: (
    eventName: string,
    listener: (event: Record<string, unknown>) => void,
  ) => Promise<ListenerHandle>;
};

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      Plugins?: Record<string, CapacitorPlugin>;
    };
  }
}

export type HapticKind =
  | "light"
  | "tap"
  | "selection"
  | "medium"
  | "heavy"
  | "success"
  | "error"
  | "warning";

export function isNativeAndroid() {
  return Boolean(
    typeof window !== "undefined" &&
      window.Capacitor?.isNativePlatform?.() &&
      window.Capacitor?.getPlatform?.() === "android",
  );
}

export function capacitorPlugin(name: string): CapacitorPlugin | null {
  if (typeof window === "undefined") return null;
  return window.Capacitor?.Plugins?.[name] ?? null;
}

export async function triggerHaptic(kind: HapticKind = "tap") {
  if (typeof window === "undefined") return;
  try {
    const plugin = capacitorPlugin("Haptics");
    if (plugin) {
      if (kind === "success" || kind === "error" || kind === "warning") {
        await plugin.notification?.({
          type: kind === "success" ? "SUCCESS" : kind === "error" ? "ERROR" : "WARNING",
        });
        return;
      }
      if (kind === "selection") {
        await plugin.selectionChanged?.();
        return;
      }
      await plugin.impact?.({
        style: kind === "heavy" ? "HEAVY" : kind === "medium" ? "MEDIUM" : "LIGHT",
      });
      return;
    }
  } catch {
    // Fall through to the browser vibration API.
  }

  const duration =
    kind === "heavy" ? 55
      : kind === "medium" || kind === "error" ? 35
      : kind === "success" ? 22
      : 10;
  try {
    navigator.vibrate?.(duration);
  } catch {
    // Vibration is best-effort and unavailable on iOS Safari.
  }
}

export function emitStudioToast(
  message: string,
  tone: "info" | "success" | "error" = "info",
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("studio:native-toast", { detail: { message, tone } }),
  );
}

export function resolveStudioPath(rawUrl: string | undefined | null) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl, "https://studio.yatishara.com");
    if (url.protocol === "yatishara:" && url.hostname === "studio") {
      const explicitPath = url.searchParams.get("path");
      if (explicitPath?.startsWith("/")) return explicitPath;
      return `/${url.pathname.replace(/^\/+/, "")}${url.search}${url.hash}`;
    }
    if (url.protocol !== "https:" || url.hostname !== "studio.yatishara.com") {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function navigateToStudioPath(rawUrl: string | undefined | null) {
  const path = resolveStudioPath(rawUrl);
  if (!path || typeof window === "undefined") return false;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === path) return true;
  window.location.assign(path);
  return true;
}

export async function setNativeBadge(count: number) {
  const plugin = capacitorPlugin("Badge");
  if (!plugin) return;
  try {
    if (count > 0) await plugin.set?.({ count });
    else await plugin.clear?.();
  } catch {
    // Launcher badge support varies by manufacturer.
  }
}

function inferMimeType(filename: string, explicit?: string) {
  if (explicit) return explicit;
  const extension = filename.split(".").pop()?.toLowerCase();
  const byExtension: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    pdf: "application/pdf",
  };
  return (extension && byExtension[extension]) || "application/octet-stream";
}

export async function saveMediaNative(options: {
  url: string;
  filename: string;
  mimeType?: string;
}) {
  if (!isNativeAndroid()) return false;
  const plugin = capacitorPlugin("YatisharaMedia");
  if (!plugin?.saveToGallery) return false;
  await plugin.saveToGallery({
    ...options,
    mimeType: inferMimeType(options.filename, options.mimeType),
  });
  emitStudioToast("Saved to your device", "success");
  await triggerHaptic("success");
  return true;
}

export async function shareMediaNative(options: {
  url: string;
  filename: string;
  mimeType?: string;
  title?: string;
  text?: string;
}) {
  if (!isNativeAndroid()) return false;
  const plugin = capacitorPlugin("YatisharaMedia");
  if (!plugin?.shareFile) return false;
  await plugin.shareFile({
    ...options,
    mimeType: inferMimeType(options.filename, options.mimeType),
  });
  await triggerHaptic("selection");
  return true;
}

export async function shareTextOrUrl(options: {
  title?: string;
  text?: string;
  url?: string;
}) {
  const nativeShare = capacitorPlugin("Share");
  if (isNativeAndroid() && nativeShare?.share) {
    await nativeShare.share(options);
    return true;
  }
  if (navigator.share) {
    await navigator.share(options);
    return true;
  }
  return false;
}
