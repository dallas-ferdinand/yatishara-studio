"use client";

import { useEffect } from "react";
import { startPerformanceMonitoring, markPerfMilestone } from "@/lib/performance";

/**
 * Mounts field performance observers for the active route.
 * Keep this component tiny so it can live in the root layout.
 */
export function PerformanceReporter({ surface = "app" }: { surface?: string }) {
  useEffect(() => {
    const stop = startPerformanceMonitoring();
    markPerfMilestone("app-hydrated", { surface });
    return stop;
  }, [surface]);

  return null;
}
