import { z } from "zod";
import { jsonResult } from "../client.js";
import { validateProductionGates } from "../lib/productionGates.js";
export function registerProductionTools(server) {
    server.tool("studio_validate_production_gates", `Pre-flight gate check for @cartoon-ad-production before studio_generate_* calls. Pass production-state.json as productionState. Returns canProceed, blockers, warnings. REQUIRED before Phase D/E generate per gate-validation.md.`, {
        targetPhase: z
            .enum(["D", "C", "E5", "E", "generate"])
            .describe("Phase about to execute generation for"),
        productionState: z
            .record(z.unknown())
            .describe("Full production-state.json object"),
        artifactPaths: z
            .array(z.string())
            .optional()
            .describe("iteration artifact paths that must exist for phase proof"),
        shotId: z
            .string()
            .optional()
            .describe("Required for targetPhase E5 or E per-shot validation"),
    }, async (args) => jsonResult(validateProductionGates({
        targetPhase: args.targetPhase,
        productionState: args.productionState,
        artifactPaths: args.artifactPaths,
        shotId: args.shotId,
    })));
}
