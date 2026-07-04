/**
 * Cinema production gate validation — mirrors phase-gates.md.
 * Pure JSON validation; no Studio API calls.
 */
export type ProductionState = {
    slug?: string;
    budget_approved?: boolean;
    approved_cap_credits?: number;
    phase_signoffs?: Record<string, {
        status?: string;
        rounds?: number;
        director_statement?: string | null;
    }>;
    iteration_log?: Record<string, unknown[]>;
    approved_asset_registry?: unknown[];
    shot_packets?: Array<{
        shot_id?: string;
        duration_sec?: number;
        generation_duration_sec?: number;
        cast_on_camera?: boolean;
        storyboard_prompt?: string;
        startFrameAssetId?: string | null;
        generation_prompt?: string;
        camera?: {
            spatial_motion?: boolean;
            movement?: string;
            timing_beats?: unknown[];
        };
    }>;
    story_packet?: {
        duration_sec?: number;
        scenes?: unknown[];
    };
    approved_clips?: unknown[];
    production_bible?: {
        document_id?: string | null;
        emitted_at?: string | null;
    };
    resume?: {
        e5_completed_shot_ids?: string[];
        e_completed_shot_ids?: string[];
    };
    compromises?: Array<{
        type?: string;
    }>;
};
export type GateValidationResult = {
    canProceed: boolean;
    targetPhase: string;
    blockers: string[];
    warnings: string[];
    gatesPassed: string[];
};
export declare function validateProductionGates(args: {
    targetPhase: string;
    productionState: ProductionState;
    artifactPaths?: string[];
    shotId?: string;
}): GateValidationResult;
