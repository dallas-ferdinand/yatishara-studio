const KEY = "mercuryos-device-id";

/** Stable ID for this phone — one unlock code per device on the gateway. */
export function getDeviceId() {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
