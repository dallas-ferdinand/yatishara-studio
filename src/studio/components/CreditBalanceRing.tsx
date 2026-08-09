"use client";

import "./credit-balance-ring.css";
import { formatTtdFromCredits } from "@/studio/lib/money";

export function creditBalanceProgress(
  balance: number,
  high: number,
): number {
  if (!Number.isFinite(balance) || balance <= 0) return 0;
  if (!Number.isFinite(high) || high <= 0) return 1;
  return Math.min(1, Math.max(0, balance / high));
}

type RingProps = {
  creditBalance?: number | null;
  creditBalanceHigh?: number | null;
  children?: React.ReactNode;
  /** chrome = wraps Menu button; chip = small icon in Balance card */
  size?: "chrome" | "chip";
  className?: string;
  title?: string;
};

export function CreditBalanceRing({
  creditBalance,
  creditBalanceHigh,
  children,
  size = "chrome",
  className = "",
  title,
}: RingProps) {
  const balance = typeof creditBalance === "number" ? creditBalance : 0;
  const high =
    typeof creditBalanceHigh === "number" && creditBalanceHigh > 0
      ? creditBalanceHigh
      : Math.max(balance, 0);
  const progress = creditBalanceProgress(balance, high);
  const r = size === "chip" ? 7 : 14;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - progress);
  const vb = size === "chip" ? 18 : 36;
  const cx = vb / 2;

  return (
    <span
      className={`studio-credit-balance-ring${size === "chip" ? " is-chip" : ""}${className ? ` ${className}` : ""}`}
      title={title}
    >
      <svg
        className="studio-credit-balance-ring-svg"
        viewBox={`0 0 ${vb} ${vb}`}
        aria-hidden="true"
      >
        <circle
          className="studio-credit-balance-ring-track"
          cx={cx}
          cy={cx}
          r={r}
        />
        <circle
          className="studio-credit-balance-ring-arc"
          cx={cx}
          cy={cx}
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      {children}
    </span>
  );
}

type ChipProps = {
  creditBalance?: number | null;
  creditBalanceHigh?: number | null;
  creditPriceCents?: number | null;
  onUpgrade?: () => void;
};

export function StudioBalanceChip({
  creditBalance,
  creditBalanceHigh,
  creditPriceCents,
  onUpgrade,
}: ChipProps) {
  const balance = typeof creditBalance === "number" ? creditBalance : 0;
  const high =
    typeof creditBalanceHigh === "number" && creditBalanceHigh > 0
      ? creditBalanceHigh
      : Math.max(balance, 0);
  const totalLabel = formatTtdFromCredits(high, creditPriceCents ?? undefined);
  const remainingLabel = formatTtdFromCredits(
    balance,
    creditPriceCents ?? undefined,
  );

  return (
    <div className="studio-balance-chip">
      <div className="studio-balance-chip-head">
        <CreditBalanceRing
          size="chip"
          creditBalance={balance}
          creditBalanceHigh={high}
        />
        <span className="studio-balance-chip-title">Balance</span>
        <button
          type="button"
          className="studio-balance-chip-topup"
          onClick={() => onUpgrade?.()}
        >
          Top up
        </button>
      </div>
      <div className="studio-balance-chip-rows">
        <div className="studio-balance-chip-row is-remaining">
          <span>Remaining</span>
          <strong>{remainingLabel}</strong>
        </div>
        <div className="studio-balance-chip-row">
          <span>Total</span>
          <strong>{totalLabel}</strong>
        </div>
      </div>
    </div>
  );
}
