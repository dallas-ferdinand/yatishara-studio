export const STUDIO_WAM_RETURN_KEY = "yatishara-studio-wam-return-v1";
export const STUDIO_WAM_RETURN_COOKIE = "yatishara-studio-wam-return";
export const WAM_RETURN_TTL_MS = 15 * 60 * 1000;

export type WamReturnPayload = {
  paymentId?: string;
  academyCourse?: string;
  billing?: "plans" | "invoices" | "topup" | "academy";
  identifier?: string;
  amountCents?: number;
  wamOk?: boolean;
  at?: number;
};

export function parseWamReturnPayload(raw: unknown): WamReturnPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const at = Number(row.at);
  if (Number.isFinite(at) && Date.now() - at > WAM_RETURN_TTL_MS) return null;
  const billing =
    row.billing === "plans" ||
    row.billing === "invoices" ||
    row.billing === "topup" ||
    row.billing === "academy"
      ? row.billing
      : undefined;
  const amountRaw = Number(row.amountCents);
  return {
    ...(typeof row.paymentId === "string" && row.paymentId ? { paymentId: row.paymentId } : {}),
    ...(typeof row.academyCourse === "string" && row.academyCourse
      ? { academyCourse: row.academyCourse }
      : {}),
    ...(billing ? { billing } : {}),
    ...(typeof row.identifier === "string" && row.identifier
      ? { identifier: row.identifier }
      : {}),
    ...(Number.isFinite(amountRaw) && amountRaw > 0 ? { amountCents: amountRaw } : {}),
    ...(row.wamOk === true ? { wamOk: true } : {}),
    ...(Number.isFinite(at) ? { at } : {}),
  };
}

export function encodeWamReturnCookie(payload: WamReturnPayload): string {
  return encodeURIComponent(JSON.stringify({ ...payload, at: payload.at || Date.now() }));
}

export function decodeWamReturnCookie(value: string | undefined | null): WamReturnPayload | null {
  if (!value) return null;
  try {
    return parseWamReturnPayload(JSON.parse(decodeURIComponent(value)));
  } catch {
    return null;
  }
}
