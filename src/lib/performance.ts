/**
 * Field + lab performance instrumentation for Yatishara Studio.
 * Emits Web Vitals, interaction milestones, and long-animation-frame signals
 * without blocking the main thread.
 */

export type PerfMetricName =
  | "LCP"
  | "INP"
  | "CLS"
  | "TTFB"
  | "FCP"
  | "long-animation-frame"
  | "milestone"
  | "editor-frame"
  | "memory";

export type PerfMetric = {
  name: PerfMetricName | string;
  value: number;
  rating?: "good" | "needs-improvement" | "poor";
  route?: string;
  surface?: string;
  authState?: "anonymous" | "authenticated" | "unknown";
  buildId?: string;
  detail?: Record<string, string | number | boolean | undefined>;
  ts: number;
};

export type PerfBudgets = {
  lcpMs: number;
  inpMs: number;
  cls: number;
  initialJsGzipKb: number;
  initialCssGzipKb: number;
  longTaskMs: number;
};

/** Hard budgets from the True Performance plan. */
export const PERF_BUDGETS: PerfBudgets = {
  lcpMs: 2500,
  inpMs: 200,
  cls: 0.1,
  initialJsGzipKb: 180,
  initialCssGzipKb: 50,
  longTaskMs: 200,
};

const listeners = new Set<(metric: PerfMetric) => void>();
let started = false;
let clsValue = 0;

function buildId(): string {
  return process.env.NEXT_PUBLIC_DESK_BUILD ?? "dev";
}

function currentRoute(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

function rateVital(name: string, value: number): PerfMetric["rating"] {
  if (name === "LCP") {
    if (value <= 2500) return "good";
    if (value <= 4000) return "needs-improvement";
    return "poor";
  }
  if (name === "INP") {
    if (value <= 200) return "good";
    if (value <= 500) return "needs-improvement";
    return "poor";
  }
  if (name === "CLS") {
    if (value <= 0.1) return "good";
    if (value <= 0.25) return "needs-improvement";
    return "poor";
  }
  if (name === "TTFB") {
    if (value <= 800) return "good";
    if (value <= 1800) return "needs-improvement";
    return "poor";
  }
  return undefined;
}

export function subscribePerfMetrics(listener: (metric: PerfMetric) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reportPerfMetric(
  name: PerfMetricName | string,
  value: number,
  detail?: PerfMetric["detail"],
  surface?: string,
): void {
  const metric: PerfMetric = {
    name,
    value,
    rating: rateVital(name, value),
    route: currentRoute(),
    surface,
    buildId: buildId(),
    detail,
    ts: Date.now(),
  };
  for (const listener of listeners) {
    try {
      listener(metric);
    } catch {
      /* ignore subscriber errors */
    }
  }
  if (typeof window !== "undefined") {
    const w = window as Window & { __studioPerf?: PerfMetric[] };
    w.__studioPerf = w.__studioPerf ?? [];
    w.__studioPerf.push(metric);
    if (w.__studioPerf.length > 200) w.__studioPerf.shift();
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.debug("[perf]", name, Math.round(value * 1000) / 1000, detail ?? "");
    }
  }
}

/** Mark a named experience milestone (workspace-ready, first-folder-ready, etc.). */
export function markPerfMilestone(name: string, detail?: PerfMetric["detail"]): void {
  const start = typeof performance !== "undefined" ? performance.now() : 0;
  if (typeof performance !== "undefined") {
    try {
      performance.mark(`studio:${name}`);
    } catch {
      /* ignore */
    }
  }
  reportPerfMetric("milestone", start, { ...detail, milestone: name }, name);
}

export function markWorkspaceReady(authState: "anonymous" | "authenticated"): void {
  markPerfMilestone("workspace-ready", { authState });
}

export function markGenerationSubmit(latencyMs: number): void {
  reportPerfMetric("milestone", latencyMs, { milestone: "generation-submit" }, "composer");
}

/**
 * Throttle playhead React updates to ~30 Hz while playback runs at 60 fps
 * via refs / imperative DOM. Returns true when the caller should commit.
 */
export function shouldCommitPlayhead(
  lastCommitMs: number,
  nowMs: number,
  minIntervalMs = 33,
): boolean {
  return nowMs - lastCommitMs >= minIntervalMs;
}

function observePaint(): void {
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          reportPerfMetric("FCP", entry.startTime);
        }
      }
    });
    po.observe({ type: "paint", buffered: true });
  } catch {
    /* unsupported */
  }
}

function observeLcp(): void {
  try {
    const po = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) reportPerfMetric("LCP", last.startTime);
    });
    po.observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    /* unsupported */
  }
}

function observeCls(): void {
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEntry[]) {
        const layout = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
        if (layout.hadRecentInput) continue;
        clsValue += layout.value ?? 0;
        reportPerfMetric("CLS", clsValue);
      }
    });
    po.observe({ type: "layout-shift", buffered: true });
  } catch {
    /* unsupported */
  }
}

function observeInp(): void {
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEntry[]) {
        const e = entry as PerformanceEntry & {
          interactionId?: number;
          duration?: number;
          processingStart?: number;
          startTime?: number;
        };
        if (!e.interactionId) continue;
        const delay =
          typeof e.duration === "number"
            ? e.duration
            : (e.processingStart ?? 0) - (e.startTime ?? 0);
        reportPerfMetric("INP", delay);
      }
    });
    po.observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  } catch {
    /* unsupported */
  }
}

function observeLongAnimationFrames(): void {
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= PERF_BUDGETS.longTaskMs) {
          reportPerfMetric("long-animation-frame", entry.duration, {
            name: entry.name,
          });
        }
      }
    });
    po.observe({ type: "long-animation-frame", buffered: true } as PerformanceObserverInit);
  } catch {
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= PERF_BUDGETS.longTaskMs) {
            reportPerfMetric("long-animation-frame", entry.duration);
          }
        }
      });
      po.observe({ type: "longtask", buffered: true });
    } catch {
      /* unsupported */
    }
  }
}

function reportNavigationTtfb(): void {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav) reportPerfMetric("TTFB", nav.responseStart);
  } catch {
    /* ignore */
  }
}

function sampleMemory(): void {
  try {
    const mem = (performance as Performance & {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    }).memory;
    if (!mem) return;
    reportPerfMetric("memory", mem.usedJSHeapSize, {
      limit: mem.jsHeapSizeLimit,
      usedMb: Math.round(mem.usedJSHeapSize / (1024 * 1024)),
    });
  } catch {
    /* ignore */
  }
}

/** Start observers once per page lifetime. Safe to call from React effects. */
export function startPerformanceMonitoring(): () => void {
  if (typeof window === "undefined" || started) {
    return () => undefined;
  }
  started = true;
  reportNavigationTtfb();
  observePaint();
  observeLcp();
  observeCls();
  observeInp();
  observeLongAnimationFrames();
  sampleMemory();
  const memoryTimer = window.setInterval(sampleMemory, 60_000);
  return () => {
    window.clearInterval(memoryTimer);
  };
}
