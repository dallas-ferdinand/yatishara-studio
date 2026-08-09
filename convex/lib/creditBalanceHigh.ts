/** Ring denominator: last top-up balance (resets on grant) vs max on refund. */

export const CREDIT_GRANT_KINDS = new Set([
  "top_up",
  "subscription_grant",
  "admin_adjustment",
]);

export function nextCreditBalanceHigh(args: {
  previousHigh?: number | null;
  balanceAfter: number;
  mode: "reset" | "max";
}): number {
  const prev =
    typeof args.previousHigh === "number" && Number.isFinite(args.previousHigh)
      ? Math.max(0, args.previousHigh)
      : 0;
  const after = Math.max(0, args.balanceAfter);
  if (args.mode === "reset") return after;
  return Math.max(prev, after);
}

/** Client/query fallback when high was never persisted. */
export function effectiveCreditBalanceHigh(
  creditBalance: number,
  creditBalanceHigh?: number | null,
): number {
  if (typeof creditBalanceHigh === "number" && creditBalanceHigh > 0) {
    // High should never sit below current remaining (e.g. mid-refund race).
    return Math.max(creditBalanceHigh, Math.max(0, creditBalance));
  }
  return Math.max(0, creditBalance);
}

/**
 * Prefer persisted high; else last grant txn balanceAfter (top-up / subscription /
 * admin credit). That is the “Total” ring denominator until the next top-up.
 *
 * Also repairs a collapsed high (stored === remaining after spends) when the
 * ledger still knows a taller last top-up peak.
 */
export function resolveCreditBalanceHigh(args: {
  creditBalance: number;
  creditBalanceHigh?: number | null;
  lastGrantBalanceAfter?: number | null;
}): number {
  const balance = Math.max(0, args.creditBalance);
  const stored =
    typeof args.creditBalanceHigh === "number" &&
    Number.isFinite(args.creditBalanceHigh) &&
    args.creditBalanceHigh > 0
      ? args.creditBalanceHigh
      : 0;
  const grant =
    typeof args.lastGrantBalanceAfter === "number" &&
    Number.isFinite(args.lastGrantBalanceAfter) &&
    args.lastGrantBalanceAfter > 0
      ? args.lastGrantBalanceAfter
      : 0;

  if (grant > 0 && (stored <= 0 || (stored <= balance && grant > balance))) {
    return Math.max(grant, balance);
  }
  if (stored > 0) return Math.max(stored, balance);
  return balance;
}
