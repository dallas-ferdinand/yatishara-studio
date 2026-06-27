import type { Session } from "./types";
import {
  evictBulkLocalStorage,
  isQuotaError,
  migrateChatBlobsOffLocalStorage,
  safeLocalSetItem,
} from "@/mos-app/storage-evict.js";

const GATEWAY_KEY = "mos2-gateway";
const TOKEN_KEY = "mos2-token";
const DEVICE_KEY = "mos2-device";
const USER_ID_KEY = "mos2-user-id";
const USER_NAME_KEY = "mos2-user-name";

export function defaultGatewayUrl(): string {
  if (typeof window === "undefined") return "";
  const { protocol, host } = window.location;
  if (host.includes("localhost") || host.startsWith("127.")) {
    return `${protocol}//${host.replace(/:\d+$/, "")}:8790`;
  }
  return `${protocol}//${host}`;
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    safeLocalSetItem(DEVICE_KEY, id);
  }
  return id;
}

export function loadSession(): Session | null {
  const gatewayUrl = localStorage.getItem(GATEWAY_KEY);
  const token = localStorage.getItem(TOKEN_KEY);
  if (!gatewayUrl || !token) return null;
  const userId = localStorage.getItem(USER_ID_KEY) ?? undefined;
  const displayName = localStorage.getItem(USER_NAME_KEY) ?? undefined;
  return { gatewayUrl, token, deviceId: getDeviceId(), userId, displayName };
}

export function saveSession(session: Session): void {
  void migrateChatBlobsOffLocalStorage();
  evictBulkLocalStorage();
  safeLocalSetItem(GATEWAY_KEY, session.gatewayUrl.replace(/\/+$/, ""));
  safeLocalSetItem(TOKEN_KEY, session.token);
  safeLocalSetItem(DEVICE_KEY, session.deviceId);
  if (session.userId) {
    safeLocalSetItem(USER_ID_KEY, session.userId);
    if (session.displayName) safeLocalSetItem(USER_NAME_KEY, session.displayName);
  } else {
    try {
      localStorage.removeItem(USER_ID_KEY);
      localStorage.removeItem(USER_NAME_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(GATEWAY_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(USER_NAME_KEY);
  } catch {
    /* ignore */
  }
}

export { isQuotaError };
