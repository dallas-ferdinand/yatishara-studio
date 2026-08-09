/** Ring denominator: last top-up balance (resets on grant) vs max on refund. */

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
    return creditBalanceHigh;
  }
  return Math.max(0, creditBalance);
}
