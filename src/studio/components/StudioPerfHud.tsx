"use client";

import { useEffect, useState } from "react";
import { listRecentStudioPaints } from "@/studio/lib/studioPaintMarks";

/**
 * Dallas / admin-only HUD: intent→paint timings from performance.measure.
 * Hidden unless ?studioPerf=1 or localStorage yatishara-studio-perf-hud=1.
 */
export function StudioPerfHud({ enabled }: { enabled: boolean }) {
  const [rows, setRows] = useState<Array<{ surface: string; ms: number }>>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const on =
      params.get("studioPerf") === "1" ||
      window.localStorage.getItem("yatishara-studio-perf-hud") === "1";
    setVisible(on);
  }, [enabled]);

  useEffect(() => {
    if (!visible) return undefined;
    const tick = () => setRows(listRecentStudioPaints(6));
    tick();
    const id = window.setInterval(tick, 800);
    return () => window.clearInterval(id);
  }, [visible]);

  if (!enabled || !visible || rows.length === 0) return null;

  return (
    <div
      className="studio-perf-hud"
      aria-hidden="true"
      style={{
        position: "fixed",
        right: 10,
        bottom: 56,
        zIndex: 9999,
        pointerEvents: "none",
        padding: "6px 8px",
        borderRadius: 8,
        fontSize: 10,
        lineHeight: 1.35,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        color: "var(--color-cursor-text-bright, #f4f6fb)",
        background: "color-mix(in srgb, var(--mos-page, #05080f) 88%, transparent)",
        border: "1px solid var(--color-cursor-border-soft, rgba(255,255,255,0.12))",
        maxWidth: 180,
      }}
    >
      <div style={{ opacity: 0.7, marginBottom: 4 }}>intent→paint</div>
      {rows.map((row) => (
        <div key={`${row.surface}-${row.ms}`}>
          {row.surface} {row.ms}ms
        </div>
      ))}
    </div>
  );
}
