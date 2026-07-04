/**
 * Cinema production gate validation — mirrors phase-gates.md.
 * Pure JSON validation; no Studio API calls.
 */
import { validateIterationProof } from "./iterationProof.js";
import { validateTimingBudget } from "./timingBudget.js";
const SIGNED_OFF = new Set(["signed_off_clean", "signed_off_with_compromises"]);
function signoffOk(state, phase) {
    const status = state.phase_signoffs?.[phase]?.status;
    return status !== undefined && SIGNED_OFF.has(status);
}
function mergeProofResults(target, proof) {
    target.blockers.push(...proof.blockers);
    target.warnings.push(...proof.warnings);
    target.gatesPassed.push(...proof.gatesPassed);
}
function validatePhaseIteration(state, phase, strictArtifacts, collector) {
    mergeProofResults(collector, validateIterationProof({
        phase,
        iterationLog: state.iteration_log?.[phase],
        phaseSignoff: state.phase_signoffs?.[phase],
        strictArtifacts,
    }));
}
function findShot(state, shotId) {
    if (!shotId)
        return undefined;
    return state.shot_packets?.find((s) => s.shot_id === shotId);
}
function seedancePrefixPresent(prompt) {
    if (!prompt?.trim())
        return false;
    return (prompt.includes("Seedance 2.0 cinematic") ||
        prompt.includes("seedance_cinematic") ||
        prompt.includes("film grain") ||
        prompt.includes("Preserve start-frame composition"));
}
function wordCount(text) {
    if (!text?.trim())
        return 0;
    return text.trim().split(/\s+/).length;
}
const FORBIDDEN_ZOOM_RE = /\b(zoom\s+in|zoom\s+out|snap\s+zoom|optical\s+zoom)\b/i;
const FULL_LOOK_ON_I2V_RE = /Shot on ARRI Alexa/i;
const TRAVEL_VERB_RE = /\b(dolly|pan|track|push-in|pull-out|crane|orbit)\b/i;
function validateSeedanceTranslation(prompt, opts) {
    const issues = [];
    if (!prompt?.trim())
        return issues;
    if (!prompt.includes("SCENE:")) {
        issues.push("missing SCENE: header");
    }
    if (!prompt.includes("CAMERA:")) {
        issues.push("missing CAMERA: header");
    }
    const words = wordCount(prompt);
    if (words > 100) {
        issues.push(`word count ${words} exceeds 100-word I2V budget`);
    }
    if (FORBIDDEN_ZOOM_RE.test(prompt)) {
        issues.push("contains forbidden zoom language — use dolly/track");
    }
    if (opts?.castOnCamera && FULL_LOOK_ON_I2V_RE.test(prompt)) {
        issues.push("full look prefix on I2V — use abbreviated PRESERVE line only");
    }
    return issues;
}
function validateStoryboardPrompt(prompt) {
    const issues = [];
    if (!prompt?.trim())
        return issues;
    if (!prompt.includes("FRAME:")) {
        issues.push("missing FRAME: header");
    }
    if (!prompt.includes("Seedance 2.0 cinematic") && !prompt.includes("film grain")) {
        issues.push("missing FULL look prefix");
    }
    if (TRAVEL_VERB_RE.test(prompt)) {
        issues.push("contains travel verbs — motion belongs in generation_prompt only");
    }
    return issues;
}
export function validateProductionGates(args) {
    const state = args.productionState ?? {};
    const target = args.targetPhase.trim().toUpperCase();
    const blockers = [];
    const warnings = [];
    const gatesPassed = [];
    if (!state.budget_approved) {
        blockers.push("G0: budget_approved must be true");
    }
    else {
        gatesPassed.push("G0");
    }
    if (args.artifactPaths?.length) {
        const empty = args.artifactPaths.filter((p) => !p?.trim());
        if (empty.length) {
            blockers.push(`Artifact paths required for phase proof but missing: ${empty.join(", ")}`);
        }
    }
    const strictArtifacts = Boolean(args.artifactPaths?.length);
    const requireAB = ["D", "C", "E5", "E", "GENERATE"].includes(target);
    if (requireAB) {
        if (!signoffOk(state, "A")) {
            blockers.push("G-A: phase_signoffs.A must be signed off");
        }
        else {
            gatesPassed.push("G-A");
            validatePhaseIteration(state, "A", strictArtifacts, { blockers, warnings, gatesPassed });
        }
        if (!signoffOk(state, "B")) {
            blockers.push("G-B: phase_signoffs.B must be signed off");
        }
        else {
            gatesPassed.push("G-B");
            validatePhaseIteration(state, "B", strictArtifacts, { blockers, warnings, gatesPassed });
        }
    }
    if (["C", "E5", "E", "GENERATE"].includes(target)) {
        if (!signoffOk(state, "D")) {
            blockers.push("G-D: phase_signoffs.D must be signed off");
        }
        else {
            gatesPassed.push("G-D");
            validatePhaseIteration(state, "D", strictArtifacts, { blockers, warnings, gatesPassed });
        }
        const registry = state.approved_asset_registry ?? [];
        if (!registry.length) {
            blockers.push("G-D coverage: approved_asset_registry must be non-empty");
        }
    }
    if (["E5", "E", "GENERATE"].includes(target)) {
        if (!signoffOk(state, "C")) {
            blockers.push("G-C: phase_signoffs.C must be signed off");
        }
        else {
            gatesPassed.push("G-C");
            validatePhaseIteration(state, "C", strictArtifacts, { blockers, warnings, gatesPassed });
        }
        const bible = state.production_bible;
        if (!bible?.document_id && !bible?.emitted_at) {
            blockers.push("G-bible: production_bible.document_id or emitted_at required");
        }
        else {
            gatesPassed.push("G-bible");
        }
        for (const shot of state.shot_packets ?? []) {
            if (shot.cast_on_camera && !shot.storyboard_prompt?.trim()) {
                blockers.push(`G-C storyboard: shot ${shot.shot_id ?? "?"} missing storyboard_prompt`);
            }
            const translationIssues = validateSeedanceTranslation(shot.generation_prompt, {
                castOnCamera: shot.cast_on_camera,
            });
            const storyboardIssues = shot.cast_on_camera
                ? validateStoryboardPrompt(shot.storyboard_prompt)
                : [];
            const useBlockers = ["E5", "E", "GENERATE"].includes(target);
            for (const issue of translationIssues) {
                const msg = `G-C seedance translation: shot ${shot.shot_id ?? "?"} ${issue}`;
                if (useBlockers)
                    blockers.push(msg);
                else
                    warnings.push(msg);
            }
            for (const issue of storyboardIssues) {
                const msg = `G-C storyboard: shot ${shot.shot_id ?? "?"} ${issue}`;
                if (useBlockers && shot.cast_on_camera)
                    blockers.push(msg);
                else
                    warnings.push(msg);
            }
            if (shot.cast_on_camera &&
                !seedancePrefixPresent(shot.generation_prompt) &&
                useBlockers) {
                blockers.push(`G-C seedance: shot ${shot.shot_id ?? "?"} generation_prompt missing PRESERVE line`);
            }
            else if (shot.cast_on_camera && !seedancePrefixPresent(shot.generation_prompt)) {
                warnings.push(`G-C seedance: shot ${shot.shot_id ?? "?"} generation_prompt may lack PRESERVE/look line`);
            }
        }
        const targetDuration = state.story_packet?.duration_sec ??
            state.shot_packets?.reduce((s, sh) => s + (sh.duration_sec ?? 0), 0);
        const sceneCount = Array.isArray(state.story_packet?.scenes)
            ? state.story_packet.scenes.length
            : undefined;
        const timingIssues = validateTimingBudget({
            targetDurationSec: targetDuration,
            sceneCount,
            shots: state.shot_packets,
        });
        for (const issue of timingIssues) {
            const msg = `G-C timing: ${issue}`;
            if (["E5", "E", "GENERATE"].includes(target))
                blockers.push(msg);
            else
                warnings.push(msg);
        }
    }
    if (target === "E5" || target === "E") {
        const shotId = args.shotId;
        if (!shotId) {
            blockers.push("shotId required for E5 and E gate validation");
        }
        else {
            const shot = findShot(state, shotId);
            if (!shot) {
                blockers.push(`shot_packets missing shot_id ${shotId}`);
            }
            else if (target === "E5") {
                if (state.resume?.e5_completed_shot_ids?.includes(shotId)) {
                    warnings.push(`Resume: E.5 already completed for ${shotId} — skip unless re-scrutiny failed`);
                }
                if (!shot.cast_on_camera) {
                    warnings.push(`${shotId} has no cast — E.5 optional`);
                }
                else if (!shot.storyboard_prompt?.trim()) {
                    blockers.push(`G-E5: ${shotId} needs storyboard_prompt`);
                }
            }
            else if (target === "E") {
                if (state.resume?.e_completed_shot_ids?.includes(shotId)) {
                    warnings.push(`Resume: E video already completed for ${shotId}`);
                }
                if (shot.cast_on_camera && !shot.startFrameAssetId) {
                    blockers.push(`G-E5: ${shotId} cast on camera but startFrameAssetId missing — run E.5 first`);
                }
                if (!shot.generation_prompt?.trim()) {
                    blockers.push(`G-E: ${shotId} missing generation_prompt`);
                }
            }
        }
    }
    const fastPath = state.compromises?.some((c) => c.type === "fast_path");
    if (fastPath && ["D", "E5", "E"].includes(target)) {
        warnings.push("fast_path compromise logged — ensure specialist iteration was intentionally skipped");
    }
    return {
        canProceed: blockers.length === 0,
        targetPhase: args.targetPhase,
        blockers,
        warnings,
        gatesPassed,
    };
}
