/** Desk PWA update helpers — no native installer path. */

async function bakedVersion() {
  try {
    const res = await fetch("version.json", { cache: "no-store" });
    if (res.ok) return res.json();
  } catch {
    /* ignore */
  }
  return { versionCode: 0, versionName: "0.0.0" };
}

export async function getInstalledVersion() {
  return bakedVersion();
}

async function fetchRemoteVersion(session) {
  if (!session?.gatewayUrl) return { error: "not_connected" };
  try {
    const [installed, res] = await Promise.all([
      getInstalledVersion(),
      fetch(`${session.gatewayUrl}/api/client/version`, {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      }),
    ]);
    if (!res.ok) return { error: "gateway_error", status: res.status };
    const remote = await res.json();
    if (remote.ok === false) return { error: remote.error ?? "gateway_error" };
    const remoteVersion = remote.version ?? remote;
    const remoteCode = Number(remoteVersion.versionCode ?? remoteVersion.buildId ?? 0);
    const installedCode = Number(installed.versionCode ?? 0);
    if (remoteCode && installedCode && remoteCode > installedCode) {
      return { update: { ...remoteVersion, installedVersion: installed.versionName } };
    }
    return { upToDate: true, installed, remote: remoteVersion };
  } catch (err) {
    return { error: err?.message ?? "unreachable" };
  }
}

export async function maybeShowUpdate(session) {
  const result = await fetchRemoteVersion(session);
  return result.update ?? null;
}

export async function probeUpdateStatus(session) {
  const result = await fetchRemoteVersion(session);
  if (result.error === "not_connected") return { state: "offline" };
  if (result.error) return { state: "error", message: result.error };
  if (result.update) return { state: "available", update: result.update };
  return { state: "current", version: result.installed?.versionName ?? result.remote?.versionName ?? "current" };
}
