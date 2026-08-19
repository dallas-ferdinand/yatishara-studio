/** Network Information API — cellular / Save-Data. Missing in Safari. */
type NetworkConnection = {
  saveData?: boolean;
  effectiveType?: string;
  type?: string;
};

function networkConnection(): NetworkConnection | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & { connection?: NetworkConnection };
  return nav.connection ?? null;
}

/** True on Save-Data, cellular, or slow effective types. */
export function isConstrainedNetwork(): boolean {
  const conn = networkConnection();
  if (!conn) return false;
  if (conn.saveData) return true;
  if (conn.type === "cellular") return true;
  const effective = conn.effectiveType ?? "";
  return effective === "slow-2g" || effective === "2g" || effective === "3g";
}
