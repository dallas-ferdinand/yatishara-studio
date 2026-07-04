/**
 * Iteration loop proof — mirrors iteration-protocol.md + phase-gates.md.
 * Validates build → merge → scrutiny per round with artifact evidence.
 */
export type IterationEntry = Record<string, unknown>;
export type PhaseIterationSpec = {
    build: string[];
    merge: string[];
    mergeRequired?: boolean;
    scrutiny: string[];
    scrutinyMin?: number;
    maxRounds: number;
};
export declare const PHASE_ITERATION_SPECS: Record<string, PhaseIterationSpec>;
export type IterationProofResult = {
    blockers: string[];
    warnings: string[];
    gatesPassed: string[];
};
export declare function validateIterationProof(args: {
    phase: string;
    iterationLog?: unknown[];
    phaseSignoff?: {
        status?: string;
        rounds?: number;
    };
    strictArtifacts?: boolean;
}): IterationProofResult;
