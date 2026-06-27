export async function tryPortalSession() {
  try {
    const res = await fetch("/api/access/me", { credentials: "include", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

export function portalLoginRedirect() {
  const next = window.location.pathname + window.location.search;
  window.location.replace(`/login?next=${encodeURIComponent(next || "/")}`);
}

export async function signOut() {
  try {
    await fetch("/api/access/logout", { method: "POST", credentials: "include" });
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem("mos2-token");
    localStorage.removeItem("mos2-gateway");
  } catch {
    /* ignore */
  }
  window.location.replace("/");
}
