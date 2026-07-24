"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { PauseIcon, PlayIcon } from "lucide-react";
import { Orb, type AgentState } from "@/components/ui/orb";
import { cn } from "@/lib/utils";
import "./studio-orb-play-button.css";

type Props = {
  playing?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** Stable seed → unique Orb color pair + shader seed. */
  seed?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  displayOnly?: boolean;
  showGlyph?: boolean;
  agentState?: AgentState;
  /**
   * Force WebGL Orb on (chat play). List avatars auto-mount when visible
   * within a shared GPU budget so premades like Adam don't blank out.
   */
  live?: boolean;
  "aria-label"?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

const SIZE_CLASS = {
  sm: "is-sm",
  md: "is-md",
  lg: "is-lg",
} as const;

/**
 * Soft pastel pairs from ElevenLabs Orb demo
 * (ui.elevenlabs.io — Agent Orbs).
 */
const ORB_PALETTES: [string, string][] = [
  ["#CADCFC", "#A0B9D1"],
  ["#F6E7D8", "#E0CFC2"],
  ["#E5E7EB", "#9CA3AF"],
  ["#D8F3E7", "#8FCBB5"],
  ["#F3D8E8", "#C98FB3"],
  ["#E6D8F3", "#B38FC9"],
  ["#F3EAD8", "#C9B38F"],
  ["#D8EAF3", "#8FB3C9"],
  ["#F0D8D8", "#C99F9F"],
  ["#D8F0F0", "#8FC0C0"],
  ["#E8F0D8", "#A8C08F"],
  ["#F0E0F3", "#C09FC9"],
];

/** Browsers typically allow ~8–16 WebGL contexts; stay conservative. */
const MAX_LIVE_ORBS = 8;
const liveOrbHolders = new Set<string>();
const liveOrbWaiters = new Set<() => void>();

function notifyOrbWaiters() {
  for (const wake of [...liveOrbWaiters]) wake();
}

function claimLiveOrb(id: string): boolean {
  if (liveOrbHolders.has(id)) return true;
  if (liveOrbHolders.size >= MAX_LIVE_ORBS) return false;
  liveOrbHolders.add(id);
  return true;
}

function releaseLiveOrb(id: string) {
  if (!liveOrbHolders.delete(id)) return;
  notifyOrbWaiters();
}

function colorsFromSeed(seed: number): [string, string] {
  const n = Math.abs(seed || 1000) >>> 0;
  return ORB_PALETTES[n % ORB_PALETTES.length]!;
}

/** Stable unique seed per voice (voiceId + name). */
export function orbSeedForVoice(voiceId: string, name?: string): number {
  const key = `${voiceId}\0${name ?? ""}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function useVisibleInViewport(enabled: boolean) {
  const nodeRef = useRef<HTMLElement | null>(null);
  // Bump only when the observed node identity changes — never put the DOM node
  // in React state (ref cleanup ↔ setState loops = React #301).
  const [attachEpoch, setAttachEpoch] = useState(0);
  const [visible, setVisible] = useState(!enabled);

  const setNode = useCallback((el: HTMLElement | null) => {
    if (nodeRef.current === el) return;
    nodeRef.current = el;
    queueMicrotask(() => setAttachEpoch((n) => n + 1));
  }, []);

  useEffect(() => {
    const node = nodeRef.current;
    if (!enabled || !node) {
      setVisible((prev) => {
        const next = !enabled;
        return prev === next ? prev : next;
      });
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { root: null, rootMargin: "80px", threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, attachEpoch]);

  return { setNode, visible };
}

/** Claim a WebGL slot when visible (or forced). Priority for playing. */
function useLiveOrbSlot(opts: {
  force?: boolean;
  visible: boolean;
  priority?: boolean;
}) {
  const id = useId();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const want = Boolean(opts.force || opts.visible);
    if (!want) {
      releaseLiveOrb(id);
      setLive(false);
      return undefined;
    }

    const tryClaim = () => {
      if (claimLiveOrb(id)) {
        setLive(true);
        return true;
      }
      // Playing/selected: bump someone if needed by waiting briefly
      setLive(false);
      return false;
    };

    if (tryClaim()) return () => releaseLiveOrb(id);

    const wake = () => {
      if (tryClaim()) liveOrbWaiters.delete(wake);
    };
    liveOrbWaiters.add(wake);
    // Priority: retry immediately after a tick in case a slot frees
    if (opts.priority) {
      const t = window.setTimeout(wake, 0);
      return () => {
        window.clearTimeout(t);
        liveOrbWaiters.delete(wake);
        releaseLiveOrb(id);
      };
    }
    return () => {
      liveOrbWaiters.delete(wake);
      releaseLiveOrb(id);
    };
  }, [id, opts.force, opts.visible, opts.priority]);

  return live;
}

function OrbShell({
  seed,
  playing,
  agentState,
  forceLive,
}: {
  seed: number;
  playing: boolean;
  agentState?: AgentState;
  forceLive?: boolean;
}) {
  const { setNode, visible } = useVisibleInViewport(!forceLive);
  const live = useLiveOrbSlot({
    force: forceLive || playing,
    visible,
    priority: playing,
  });
  const colors = colorsFromSeed(seed);
  const state: AgentState =
    agentState !== undefined
      ? agentState
      : playing
        ? "talking"
        : "thinking";
  const fallbackStyle = {
    ["--orb-c1" as string]: colors[0],
    ["--orb-c2" as string]: colors[1],
  } as CSSProperties;

  return (
    <span ref={setNode} className="studio-orb-frame" aria-hidden="true">
      <span className="studio-orb-well">
        <span className="studio-orb-fallback" style={fallbackStyle} />
        {live ? (
          <Suspense fallback={null}>
            <Orb
              colors={colors}
              seed={seed || 1000}
              agentState={state}
              className="studio-orb-canvas"
            />
          </Suspense>
        ) : null}
      </span>
    </span>
  );
}

export function StudioOrbPlayButton({
  playing = false,
  disabled,
  loading,
  seed = 1000,
  size = "md",
  className,
  displayOnly = false,
  showGlyph = false,
  agentState,
  live = true,
  "aria-label": ariaLabel,
  onClick,
}: Props) {
  const body = (
    <>
      <OrbShell
        seed={seed}
        playing={playing}
        agentState={agentState}
        forceLive={live}
      />
      <span
        className={cn(
          "studio-orb-play-glyph",
          (showGlyph || playing || loading) && "is-visible",
        )}
        aria-hidden="true"
      >
        {loading ? (
          <span className="studio-orb-play-spinner" />
        ) : playing ? (
          <PauseIcon className="size-[40%] fill-current" strokeWidth={0} />
        ) : (
          <PlayIcon className="size-[40%] fill-current" strokeWidth={0} />
        )}
      </span>
    </>
  );

  if (displayOnly) {
    return (
      <span className={cn("studio-orb-play", SIZE_CLASS[size], className)}>
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={cn("studio-orb-play", SIZE_CLASS[size], className)}
      disabled={disabled}
      aria-label={ariaLabel ?? (playing ? "Pause" : "Play")}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

/** Voice list: real EL Orb when in view / playing, within GPU budget. */
export function StudioOrbAvatar({
  seed = 1000,
  className,
  playing = false,
}: {
  seed?: number;
  className?: string;
  playing?: boolean;
  /** @deprecated ignored — visibility + budget decide WebGL */
  live?: boolean;
}) {
  return (
    <span
      className={cn("studio-orb-play is-md", playing && "is-playing", className)}
      aria-hidden="true"
    >
      <OrbShell seed={seed} playing={playing} forceLive={playing} />
    </span>
  );
}
