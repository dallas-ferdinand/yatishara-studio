/**
 * Timing budget validation — mirrors timing-foundation.md.
 */

export type DurationTier = {
  label: string;
  minSec: number;
  maxSec: number;
  minScenes: number;
  maxScenes: number;
  minShots: number;
  maxShots: number;
};

export const DURATION_TIERS: DurationTier[] = [
  { label: "15s_social_punch", minSec: 13, maxSec: 17, minScenes: 1, maxScenes: 1, minShots: 3, maxShots: 5 },
  { label: "30s_social_standard", minSec: 28, maxSec: 32, minScenes: 1, maxScenes: 2, minShots: 5, maxShots: 7 },
  { label: "60s_broadcast_short", minSec: 58, maxSec: 62, minScenes: 3, maxScenes: 4, minShots: 8, maxShots: 12 },
  { label: "90s_brand_standard", minSec: 88, maxSec: 92, minScenes: 4, maxScenes: 6, minShots: 10, maxShots: 18 },
  { label: "180s_long_form", minSec: 175, maxSec: 185, minScenes: 6, maxScenes: 8, minShots: 16, maxShots: 24 },
];

const DURATION_TOLERANCE_SEC = 2;
const SEEDANCE_MIN_GEN_SEC = 4;

export function resolveDurationTier(durationSec: number): DurationTier | null {
  for (const tier of DURATION_TIERS) {
    if (durationSec >= tier.minSec && durationSec <= tier.maxSec) return tier;
  }
  return null;
}

export function validateTimingBudget(args: {
  targetDurationSec?: number;
  sceneCount?: number;
  shots?: Array<{
    shot_id?: string;
    duration_sec?: number;
    generation_duration_sec?: number;
    camera?: { timing_beats?: unknown[] };
  }>;
}): string[] {
  const issues: string[] = [];
  const target = args.targetDurationSec;
  const shots = args.shots ?? [];

  if (!target || !shots.length) return issues;

  const editorialSum = shots.reduce((sum, s) => sum + (s.duration_sec ?? 0), 0);
  if (Math.abs(editorialSum - target) > DURATION_TOLERANCE_SEC) {
    issues.push(
      `shot durations sum ${editorialSum}s ≠ target ${target}s (allowed ±${DURATION_TOLERANCE_SEC}s)`,
    );
  }

  const genSum = shots.reduce((sum, s) => sum + (s.generation_duration_sec ?? 0), 0);
  if (genSum < editorialSum - DURATION_TOLERANCE_SEC) {
    issues.push(
      `generation_duration_sec sum ${genSum}s < editorial ${editorialSum}s — trim budget impossible`,
    );
  }

  const tier = resolveDurationTier(target);
  if (tier) {
    if (shots.length < tier.minShots || shots.length > tier.maxShots) {
      issues.push(
        `shot count ${shots.length} outside ${tier.label} budget ${tier.minShots}–${tier.maxShots}`,
      );
    }
    const scenes = args.sceneCount;
    if (scenes !== undefined && (scenes < tier.minScenes || scenes > tier.maxScenes)) {
      issues.push(
        `scene count ${scenes} outside ${tier.label} budget ${tier.minScenes}–${tier.maxScenes}`,
      );
    }
  } else {
    issues.push(`duration ${target}s does not match a standard tier (15/30/60/90/180)`);
  }

  for (const shot of shots) {
    const gen = shot.generation_duration_sec;
    if (gen !== undefined && gen > 0 && gen < SEEDANCE_MIN_GEN_SEC) {
      issues.push(
        `shot ${shot.shot_id ?? "?"} generation_duration_sec ${gen}s below Seedance minimum ${SEEDANCE_MIN_GEN_SEC}s`,
      );
    }
    const editorial = shot.duration_sec ?? 0;
    if (editorial > 0 && editorial < 1.5) {
      issues.push(
        `shot ${shot.shot_id ?? "?"} editorial duration ${editorial}s too short — min 1.5s for readable beat`,
      );
    }
  }

  return issues;
}
