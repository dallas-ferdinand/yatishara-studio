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
export declare const DURATION_TIERS: DurationTier[];
export declare function resolveDurationTier(durationSec: number): DurationTier | null;
export declare function validateTimingBudget(args: {
    targetDurationSec?: number;
    sceneCount?: number;
    shots?: Array<{
        shot_id?: string;
        duration_sec?: number;
        generation_duration_sec?: number;
        camera?: {
            timing_beats?: unknown[];
        };
    }>;
}): string[];
