"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (digits: string) => void;
  onComplete?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
};

export function PinCodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.replace(/\D/g, "").slice(0, 6);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (digits.length === 6) onComplete?.();
  }, [digits, onComplete]);

  const cursorIndex = digits.length >= 6 ? 5 : digits.length;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => inputRef.current?.focus()}
      className="relative w-full border-0 bg-transparent p-0 text-left disabled:opacity-50"
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        disabled={disabled}
        value={digits}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="pointer-events-none absolute h-px w-px opacity-0"
        aria-label="6-digit unlock code"
      />
      <div className="flex justify-center gap-1.5">
        {Array.from({ length: 6 }, (_, i) => {
          const filled = i < digits.length;
          const active = focused && !disabled && i === cursorIndex;
          return (
            <div
              key={i}
              className={`flex h-[50px] w-[42px] items-center justify-center rounded-[10px] border bg-mos-panel font-mono text-xl font-semibold transition-all duration-150 ${
                active
                  ? "border-mos-accent shadow-[0_0_8px_color-mix(in_srgb,var(--mos-accent)_12%,transparent)]"
                  : filled
                    ? "border-mos-border text-mos-text-bright"
                    : "border-mos-border text-mos-text"
              }`}
            >
              {filled ? (
                digits[i]
              ) : active ? (
                <span className="h-[18px] w-0.5 animate-pulse bg-mos-accent/85" />
              ) : null}
            </div>
          );
        })}
      </div>
    </button>
  );
}
