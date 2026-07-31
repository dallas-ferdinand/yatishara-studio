"use client";

import { useAction } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { EditorClip } from "../types";
import { clipSpeed, CLIP_SPEED_MIN, CLIP_SPEED_MAX } from "../projectContract";
import { isIdentitySpeed } from "../../../../convex/lib/naturalAudioSpeed";

export type NaturalSpeedNeed = {
  clipId: string;
  assetId: string;
  trimIn: number;
  trimOut: number;
  speed: number;
};

function needsKey(need: NaturalSpeedNeed): string {
  return `${need.assetId}|${need.trimIn.toFixed(3)}|${need.trimOut.toFixed(3)}|${need.speed.toFixed(3)}`;
}

/** Collect video/audio clips that need a natural-speed audio bake. */
export function collectNaturalSpeedNeeds(clips: EditorClip[]): NaturalSpeedNeed[] {
  const out: NaturalSpeedNeed[] = [];
  for (const clip of clips) {
    if (clip.kind !== "video" && clip.kind !== "audio") continue;
    if (!clip.assetId) continue;
    const speed = clipSpeed(clip.effects);
    if (isIdentitySpeed(speed)) continue;
    out.push({
      clipId: clip.id,
      assetId: clip.assetId,
      trimIn: clip.trimIn,
      trimOut: clip.trimOut,
      speed: Math.min(CLIP_SPEED_MAX, Math.max(CLIP_SPEED_MIN, speed)),
    });
  }
  return out;
}

/**
 * Ensures natural atempo+EQ audio URLs for sped clips (preview parity with export).
 * Debounces while the speed slider moves.
 */
export function useNaturalSpeedAudio(clips: EditorClip[]): {
  naturalAudioByClipId: ReadonlyMap<string, string>;
  pendingClipIds: ReadonlySet<string>;
  processing: boolean;
} {
  const renderNaturalSpeedAudio = useAction(
    api.videoEditActions.renderNaturalSpeedAudio,
  );
  const [urlByClipId, setUrlByClipId] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [pendingClipIds, setPendingClipIds] = useState<Set<string>>(
    () => new Set(),
  );
  const cacheRef = useRef<Map<string, string>>(new Map());
  const needs = useMemo(() => collectNaturalSpeedNeeds(clips), [clips]);
  const needsSig = useMemo(
    () => needs.map((n) => `${n.clipId}:${needsKey(n)}`).join(";"),
    [needs],
  );

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const nextUrls = new Map<string, string>();
        const pending = new Set<string>();
        const work: NaturalSpeedNeed[] = [];

        for (const need of needs) {
          const key = needsKey(need);
          const cached = cacheRef.current.get(key);
          if (cached) {
            nextUrls.set(need.clipId, cached);
            continue;
          }
          pending.add(need.clipId);
          work.push(need);
        }

        if (!cancelled) {
          setUrlByClipId(nextUrls);
          setPendingClipIds(pending);
        }
        if (!work.length) return;

        await Promise.all(
          work.map(async (need) => {
            try {
              const result = await renderNaturalSpeedAudio({
                assetId: need.assetId as Id<"assets">,
                trimIn: need.trimIn,
                trimOut: need.trimOut,
                speed: need.speed,
              });
              const key = needsKey(need);
              cacheRef.current.set(key, result.url);
              if (cancelled) return;
              setUrlByClipId((prev) => {
                const next = new Map(prev);
                next.set(need.clipId, result.url);
                return next;
              });
            } catch (error) {
              console.error("Natural speed audio bake failed", error);
            } finally {
              if (!cancelled) {
                setPendingClipIds((prev) => {
                  const next = new Set(prev);
                  next.delete(need.clipId);
                  return next;
                });
              }
            }
          }),
        );
      })();
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [needsSig, needs, renderNaturalSpeedAudio]);

  return {
    naturalAudioByClipId: urlByClipId,
    pendingClipIds,
    processing: pendingClipIds.size > 0,
  };
}
