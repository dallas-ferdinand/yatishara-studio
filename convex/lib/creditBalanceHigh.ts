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
  // Top-up / grant: Total = balance after credit (prior remaining + this top-up).
  if (args.mode === "reset") return after;
  // Refund / raise: never drop Total below the stored peak.
  if (prev <= 0) return after;
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
 * Prefer last grant txn balanceAfter (top-up / subscription / admin credit) as
 * the ring Total. That is prior remaining + top-up amount (e.g. 10 + 30 = 40)
 * and stays fixed while Remaining drops on spend.
 *
 * Stored high is kept when taller than the ledger peek (e.g. mid-refund race),
 * but a collapsed stored high (stuck to Remaining after spends) is repaired
 * whenever the last grant peak is taller.
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

  // Last top-up peak always wins when present — fixes Total===Remaining after spends.
  if (grant > 0 || stored > 0) {
    return Math.max(grant, stored, balance);
  }
  return balance;
}
