"use client";

import { useEffect, useState } from "react";
import "./studio-fullscreen-status.css";

function formatStatusTime(date: Date) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    const h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, "0");
    const h12 = h % 12 || 12;
    return `${h12}:${m}`;
  }
}

/** Notch / status strip for mobile browser fullscreen — time + battery % pill. */
export function StudioFullscreenStatusBar({ active }: { active: boolean }) {
  const [now, setNow] = useState(() => new Date());
  const [batteryPct, setBatteryPct] = useState<number | null>(null);
  const [charging, setCharging] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!active || typeof navigator === "undefined") return undefined;
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (type: string, fn: () => void) => void;
        removeEventListener: (type: string, fn: () => void) => void;
      }>;
    };
    if (typeof nav.getBattery !== "function") return undefined;
    let battery: Awaited<ReturnType<typeof nav.getBattery>> | null = null;
    let cancelled = false;
    const sync = () => {
      if (!battery || cancelled) return;
      setBatteryPct(Math.round(Math.min(1, Math.max(0, battery.level)) * 100));
      setCharging(Boolean(battery.charging));
    };
    void nav.getBattery().then((b) => {
      if (cancelled) return;
      battery = b;
      sync();
      b.addEventListener("levelchange", sync);
      b.addEventListener("chargingchange", sync);
    });
    return () => {
      cancelled = true;
      if (battery) {
        battery.removeEventListener("levelchange", sync);
        battery.removeEventListener("chargingchange", sync);
      }
    };
  }, [active]);

  if (!active) return null;

  const pct = batteryPct;
  const fill = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  const levelClass =
    pct == null
      ? "is-unknown"
      : charging
        ? "is-charging"
        : fill >= 70
          ? "is-high"
          : fill >= 40
            ? "is-mid"
            : fill >= 15
              ? "is-low"
              : "is-critical";

  return (
    <div className="studio-fullscreen-status" role="status" aria-live="polite">
      <span className="studio-fullscreen-status-time">{formatStatusTime(now)}</span>
      {pct != null ? (
        <span
          className={`studio-fullscreen-status-battery ${levelClass}`}
          title={charging ? `Charging ${pct}%` : `${pct}%`}
        >
          <span
            className="studio-fullscreen-status-battery-fill"
            style={{ width: `${fill}%` }}
            aria-hidden="true"
          />
          <span className="studio-fullscreen-status-battery-label">{pct}%</span>
        </span>
      ) : (
        <span className="studio-fullscreen-status-battery is-unknown" aria-hidden="true">
          <span className="studio-fullscreen-status-battery-label">—</span>
        </span>
      )}
    </div>
  );
}
