/** Canonical public Studio origin — never trust request Host behind Coolify (can be 0.0.0.0:3000). */
export function publicStudioOrigin(requestUrl?: string | URL): string {
  const fromEnv = String(process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  if (/^https:\/\/studio\.yatishara\.com$/i.test(fromEnv)) return fromEnv;
  if (/^https:\/\//i.test(fromEnv) && !/0\.0\.0\.0|127\.0\.0\.1|localhost/i.test(fromEnv)) {
    return fromEnv;
  }
  try {
    const origin = new URL(String(requestUrl || "")).origin;
    if (/^https:\/\//i.test(origin) && !/0\.0\.0\.0|127\.0\.0\.1|localhost/i.test(origin)) {
      return origin.replace(/\/+$/, "");
    }
  } catch {
    /* ignore */
  }
  return "https://studio.yatishara.com";
}
