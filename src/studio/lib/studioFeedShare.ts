/** Drag MIME for sharing a feed post/comment into a DM chat row. */

import { useSyncExternalStore } from "react";

export const STUDIO_FEED_SHARE_MIME = "application/x-studio-feed-share";

export type StudioFeedSharePayload = {
  type: "post" | "comment";
  postId: string;
  commentId?: string;
  username?: string;
  displayName?: string;
  caption?: string;
  body?: string;
  thumbnailUrl?: string;
};

export type PendingDmFeedShare = {
  conversationId: string;
  payload: StudioFeedSharePayload;
};

let pendingFeedShare: PendingDmFeedShare | null = null;
const pendingListeners = new Set<() => void>();

function emitPendingFeedShare() {
  for (const listener of pendingListeners) listener();
}

export function getPendingDmFeedShare(): PendingDmFeedShare | null {
  return pendingFeedShare;
}

export function setPendingDmFeedShare(next: PendingDmFeedShare | null): void {
  pendingFeedShare = next;
  emitPendingFeedShare();
}

export function clearPendingDmFeedShare(): void {
  if (!pendingFeedShare) return;
  pendingFeedShare = null;
  emitPendingFeedShare();
}

export function usePendingDmFeedShare(): PendingDmFeedShare | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      pendingListeners.add(onStoreChange);
      return () => {
        pendingListeners.delete(onStoreChange);
      };
    },
    getPendingDmFeedShare,
    () => null,
  );
}

export function encodeFeedSharePayload(payload: StudioFeedSharePayload): string {
  return JSON.stringify(payload);
}

export function parseFeedSharePayload(raw: string): StudioFeedSharePayload | null {
  try {
    const data = JSON.parse(raw) as Partial<StudioFeedSharePayload>;
    if (data.type !== "post" && data.type !== "comment") return null;
    if (typeof data.postId !== "string" || !data.postId) return null;
    if (data.type === "comment" && typeof data.commentId !== "string") return null;
    return {
      type: data.type,
      postId: data.postId,
      commentId: typeof data.commentId === "string" ? data.commentId : undefined,
      username: typeof data.username === "string" ? data.username : undefined,
      displayName: typeof data.displayName === "string" ? data.displayName : undefined,
      caption: typeof data.caption === "string" ? data.caption : undefined,
      body: typeof data.body === "string" ? data.body : undefined,
      thumbnailUrl: typeof data.thumbnailUrl === "string" ? data.thumbnailUrl : undefined,
    };
  } catch {
    return null;
  }
}

/** Detect a paste/drop that is our JSON payload (legacy text/plain). */
export function looksLikeFeedShareJson(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.includes('"postId"')) return false;
  return Boolean(parseFeedSharePayload(trimmed));
}

function authorLabel(payload: StudioFeedSharePayload): string {
  return (
    payload.displayName?.trim() ||
    (payload.username
      ? `@${payload.username}`
      : payload.type === "comment"
        ? "Comment"
        : "Post")
  );
}

function plainTextFallback(payload: StudioFeedSharePayload): string {
  const who = authorLabel(payload);
  if (payload.type === "comment") {
    const body = payload.body?.trim();
    return body ? `Comment by ${who}: ${body}` : `Comment by ${who}`;
  }
  const caption = payload.caption?.trim();
  return caption ? `Post by ${who}: ${caption}` : `Post by ${who}`;
}

function clipText(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/**
 * Build a drag ghost that matches the DM share card (post tile / comment card).
 * Must run synchronously inside dragstart with setData.
 */
export function setFeedShareDragImage(
  dataTransfer: DataTransfer,
  payload: StudioFeedSharePayload,
): void {
  if (typeof document === "undefined") return;

  const ghost = document.createElement("div");
  ghost.className = `studio-feed-share-drag-ghost is-${payload.type}`;
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: "-10000px",
    top: "-10000px",
    zIndex: "2147483647",
    pointerEvents: "none",
    boxSizing: "border-box",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    transform: "rotate(-2deg)",
    opacity: "0.96",
  });

  const who = authorLabel(payload);

  if (payload.type === "comment") {
    Object.assign(ghost.style, {
      display: "grid",
      gridTemplateColumns: "44px minmax(0, 1fr)",
      gap: "8px",
      alignItems: "center",
      width: "220px",
      padding: "8px",
      borderRadius: "12px",
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(28, 30, 36, 0.96)",
      color: "#f4f4f5",
      boxShadow: "none",
    });

    const thumb = document.createElement("div");
    Object.assign(thumb.style, {
      width: "44px",
      height: "44px",
      borderRadius: "8px",
      overflow: "hidden",
      background: "rgba(255,255,255,0.08)",
      display: "grid",
      placeItems: "center",
      flexShrink: "0",
      color: "rgba(255,255,255,0.55)",
      fontSize: "14px",
      fontWeight: "700",
    });
    if (payload.thumbnailUrl) {
      const img = document.createElement("img");
      img.src = payload.thumbnailUrl;
      img.alt = "";
      Object.assign(img.style, {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      });
      thumb.appendChild(img);
    } else {
      thumb.textContent = "Aa";
    }

    const copy = document.createElement("div");
    Object.assign(copy.style, {
      display: "grid",
      gap: "2px",
      minWidth: "0",
    });
    const title = document.createElement("strong");
    Object.assign(title.style, {
      fontSize: "12px",
      fontWeight: "700",
      lineHeight: "1.2",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    title.textContent = `Comment · ${who}`;
    const body = document.createElement("span");
    Object.assign(body.style, {
      fontSize: "12px",
      lineHeight: "1.35",
      color: "rgba(244,244,245,0.72)",
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: "2",
      overflow: "hidden",
    });
    body.textContent = clipText(payload.body || payload.caption || "Comment", 90);
    copy.append(title, body);
    ghost.append(thumb, copy);
  } else {
    Object.assign(ghost.style, {
      width: "120px",
      borderRadius: "12px",
      overflow: "hidden",
      background: "rgba(18, 20, 24, 0.96)",
      boxShadow: "0 12px 30px rgba(0,0,0,0.42)",
    });

    const media = document.createElement("div");
    Object.assign(media.style, {
      position: "relative",
      width: "120px",
      height: "120px",
      background: "rgba(255,255,255,0.06)",
    });

    if (payload.thumbnailUrl) {
      const img = document.createElement("img");
      img.src = payload.thumbnailUrl;
      img.alt = "";
      Object.assign(img.style, {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      });
      media.appendChild(img);
    } else {
      const empty = document.createElement("div");
      Object.assign(empty.style, {
        position: "absolute",
        inset: "0",
        display: "grid",
        placeItems: "center",
        color: "rgba(255,255,255,0.45)",
        fontSize: "13px",
        fontWeight: "700",
        letterSpacing: "0.04em",
      });
      empty.textContent = "POST";
      media.appendChild(empty);
    }

    const scrim = document.createElement("div");
    Object.assign(scrim.style, {
      position: "absolute",
      left: "0",
      right: "0",
      bottom: "0",
      height: "55%",
      background:
        "linear-gradient(180deg, transparent 0%, rgba(5,6,8,0.45) 42%, rgba(5,6,8,0.86) 100%)",
      pointerEvents: "none",
    });

    const meta = document.createElement("div");
    Object.assign(meta.style, {
      position: "absolute",
      left: "0",
      right: "0",
      bottom: "0",
      zIndex: "1",
      display: "grid",
      gap: "2px",
      padding: "8px",
      color: "#fff",
      textShadow: "0 1px 2px rgba(0,0,0,0.55)",
      minWidth: "0",
    });
    const title = document.createElement("strong");
    Object.assign(title.style, {
      fontSize: "11px",
      fontWeight: "700",
      lineHeight: "1.2",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    title.textContent = who;
    const caption = document.createElement("span");
    Object.assign(caption.style, {
      fontSize: "10px",
      lineHeight: "1.3",
      opacity: "0.92",
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: "2",
      overflow: "hidden",
    });
    caption.textContent = clipText(payload.caption || "Post", 60);
    meta.append(title, caption);
    media.append(scrim, meta);
    ghost.appendChild(media);
  }

  document.body.appendChild(ghost);
  const width = ghost.offsetWidth || (payload.type === "comment" ? 220 : 120);
  const height = ghost.offsetHeight || (payload.type === "comment" ? 60 : 120);
  dataTransfer.setDragImage(ghost, Math.round(width / 2), Math.round(height / 2));
  window.setTimeout(() => ghost.remove(), 0);
}

export function setFeedShareDataTransfer(
  dataTransfer: DataTransfer,
  payload: StudioFeedSharePayload,
): void {
  const encoded = encodeFeedSharePayload(payload);
  dataTransfer.setData(STUDIO_FEED_SHARE_MIME, encoded);
  // Never put JSON in text/plain — browsers paste that into the DM composer.
  dataTransfer.setData("text/plain", plainTextFallback(payload));
  dataTransfer.effectAllowed = "copy";
  setFeedShareDragImage(dataTransfer, payload);
}

export function readFeedShareDataTransfer(
  dataTransfer: DataTransfer,
): StudioFeedSharePayload | null {
  const custom = dataTransfer.getData(STUDIO_FEED_SHARE_MIME);
  if (custom) return parseFeedSharePayload(custom);
  // Legacy: older drags encoded JSON as text/plain.
  const plain = dataTransfer.getData("text/plain");
  if (plain && looksLikeFeedShareJson(plain)) {
    return parseFeedSharePayload(plain.trim());
  }
  return null;
}

export function feedShareDragTypes(types: readonly string[]): boolean {
  return (
    types.includes(STUDIO_FEED_SHARE_MIME) || types.includes("text/plain")
  );
}
