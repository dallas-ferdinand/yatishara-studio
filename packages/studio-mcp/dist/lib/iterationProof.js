/**
 * Iteration loop proof — mirrors iteration-protocol.md + phase-gates.md.
 * Validates build → merge → scrutiny per round with artifact evidence.
 */
export const PHASE_ITERATION_SPECS = {
    A: {
        build: ["story-architect"],
        merge: ["director-joe", "director-ernesto"],
        scrutiny: ["production-designer", "character-continuity"],
        maxRounds: 3,
    },
    B: {
        build: ["production-designer", "character-continuity", "location-scout"],
        merge: ["director-joe", "director-ernesto"],
        scrutiny: ["dp", "gaffer", "sound-designer"],
        maxRounds: 3,
    },
    D: {
        build: ["style-supervisor", "prop-master"],
        merge: ["director-joe", "director-ernesto"],
        mergeRequired: false,
        scrutiny: ["prop-master", "style-supervisor", "location-scout", "character-continuity"],
        scrutinyMin: 1,
        maxRounds: 3,
    },
    C: {
        build: [
            "editor",
            "dp",
            "gaffer",
            "sound-designer",
            "composer",
            "motion-designer",
            "colorist",
        ],
        merge: ["director-joe", "director-ernesto"],
        scrutiny: [
            "dp",
            "gaffer",
            "sound-designer",
            "composer",
            "editor",
            "motion-designer",
            "colorist",
            "character-continuity",
            "seedance-translator",
            "continuity-supervisor",
        ],
        maxRounds: 3,
    },
};
function entryRole(entry) {
    const role = entry.role ?? entry.subagent_role;
    return typeof role === "string" ? role.trim() : "";
}
function entryRound(entry) {
    const round = entry.round;
    return typeof round === "number" && Number.isFinite(round) ? round : null;
}
function entryStep(entry) {
    const step = entry.step;
    if (typeof step === "string")
        return step;
    const mode = entry.mode;
    if (mode === "merge")
        return "merge";
    if (mode === "scrutiny" || mode === "visual_scrutiny")
        return "scrutiny";
    if (mode === "build")
        return "build";
    return "";
}
function isDirectorRole(role) {
    return role.startsWith("director-");
}
function classifyEntry(entry) {
    const step = entryStep(entry);
    if (step === "round_summary")
        return "summary";
    const role = entryRole(entry);
    if (!role)
        return "other";
    if (step === "merge" || entry.mode === "merge" || isDirectorRole(role))
        return "merge";
    if (step === "scrutiny" || entry.mode === "scrutiny" || entry.mode === "visual_scrutiny") {
        return "scrutiny";
    }
    if (step === "build" || entry.mode === "build")
        return "build";
    return "other";
}
function groupByRound(entries) {
    const map = new Map();
    for (const entry of entries) {
        const round = entryRound(entry);
        if (round === null)
            continue;
        const list = map.get(round) ?? [];
        list.push(entry);
        map.set(round, list);
    }
    return map;
}
function rolesInRound(entries, kind) {
    const roles = new Set();
    for (const entry of entries) {
        const role = entryRole(entry);
        if (!role)
            continue;
        const classified = classifyEntry(entry);
        if (classified === kind)
            roles.add(role);
        if (kind === "merge" && isDirectorRole(role))
            roles.add(role);
        if (kind === "scrutiny" && entry.mode === "visual_scrutiny")
            roles.add(role);
    }
    return roles;
}
function hasRequiredRole(roles, required) {
    return required.some((r) => roles.has(r));
}
function missingRoles(roles, required) {
    return required.filter((r) => !roles.has(r));
}
function scrutinySatisfied(roles, spec) {
    const present = spec.scrutiny.filter((r) => roles.has(r));
    const min = spec.scrutinyMin ?? spec.scrutiny.length;
    if (present.length >= min)
        return [];
    if (spec.scrutinyMin === 1) {
        return present.length ? [] : [spec.scrutiny.join(" or ")];
    }
    return spec.scrutiny.filter((r) => !roles.has(r));
}
function entriesMissingArtifacts(entries) {
    return entries.filter((entry) => {
        if (classifyEntry(entry) === "summary")
            return false;
        const artifact = entry.subagent_artifact;
        return typeof artifact !== "string" || !artifact.trim();
    });
}
function getRoundSummary(entries) {
    return entries.find((e) => entryStep(e) === "round_summary" || e.packet_type === "scrutiny_report");
}
function blockingCountFromSummary(summary) {
    if (!summary)
        return null;
    const count = summary.blocking_count;
    return typeof count === "number" ? count : null;
}
export function validateIterationProof(args) {
    const phase = args.phase.trim().toUpperCase();
    const spec = PHASE_ITERATION_SPECS[phase];
    const blockers = [];
    const warnings = [];
    const gatesPassed = [];
    if (!spec) {
        return { blockers, warnings, gatesPassed };
    }
    const log = Array.isArray(args.iterationLog) ? args.iterationLog : [];
    if (!log.length) {
        blockers.push(`G-${phase} proof: iteration_log.${phase} is empty`);
        return { blockers, warnings, gatesPassed };
    }
    const byRound = groupByRound(log);
    const roundNumbers = [...byRound.keys()].sort((a, b) => a - b);
    if (!roundNumbers.length) {
        blockers.push(`G-${phase} proof: iteration_log.${phase} entries missing round numbers — use round: 1..3 on every entry`);
        return { blockers, warnings, gatesPassed };
    }
    const maxRound = roundNumbers[roundNumbers.length - 1];
    if (maxRound > spec.maxRounds) {
        blockers.push(`G-${phase} proof: round ${maxRound} exceeds max ${spec.maxRounds} rounds per iteration-protocol.md`);
    }
    const signedOff = args.phaseSignoff?.status;
    const isSignedOff = signedOff === "signed_off_clean" || signedOff === "signed_off_with_compromises";
    for (const round of roundNumbers) {
        const entries = byRound.get(round) ?? [];
        const buildRoles = rolesInRound(entries, "build");
        const mergeRoles = rolesInRound(entries, "merge");
        const scrutinyRoles = rolesInRound(entries, "scrutiny");
        const missingBuild = missingRoles(buildRoles, spec.build);
        const missingScrutiny = scrutinySatisfied(scrutinyRoles, spec);
        const hasMerge = hasRequiredRole(mergeRoles, spec.merge);
        if (phase === "C" && round === 1 && !buildRoles.has("editor")) {
            blockers.push(`G-C proof: round 1 missing editor build (shot list must come first)`);
        }
        if (missingBuild.length && isSignedOff && round === maxRound) {
            blockers.push(`G-${phase} proof: round ${round} missing build roles: ${missingBuild.join(", ")}`);
        }
        else if (missingBuild.length) {
            warnings.push(`G-${phase} proof: round ${round} missing build roles: ${missingBuild.join(", ")}`);
        }
        if (!hasMerge && (spec.mergeRequired ?? true) && isSignedOff && round === maxRound) {
            blockers.push(`G-${phase} proof: round ${round} missing director merge entry`);
        }
        else if (!hasMerge && (spec.mergeRequired ?? true)) {
            warnings.push(`G-${phase} proof: round ${round} missing director merge entry`);
        }
        if (missingScrutiny.length && isSignedOff && round === maxRound) {
            blockers.push(`G-${phase} proof: round ${round} missing scrutiny roles: ${missingScrutiny.join(", ")}`);
        }
        else if (missingScrutiny.length) {
            warnings.push(`G-${phase} proof: round ${round} missing scrutiny roles: ${missingScrutiny.join(", ")}`);
        }
        const noArtifact = entriesMissingArtifacts(entries);
        if (noArtifact.length) {
            const msg = `G-${phase} proof: round ${round} has ${noArtifact.length} entries without subagent_artifact`;
            if (args.strictArtifacts || isSignedOff)
                blockers.push(msg);
            else
                warnings.push(msg);
        }
        const summary = getRoundSummary(entries);
        if (!summary && isSignedOff && round === maxRound) {
            blockers.push(`G-${phase} proof: round ${round} missing round_summary (blocking_count required)`);
        }
    }
    if (isSignedOff) {
        const signoffRounds = args.phaseSignoff?.rounds ?? 0;
        if (signoffRounds !== maxRound) {
            warnings.push(`G-${phase} proof: phase_signoffs.${phase}.rounds is ${signoffRounds} but iteration_log max round is ${maxRound}`);
        }
        const finalEntries = byRound.get(maxRound) ?? [];
        const finalSummary = getRoundSummary(finalEntries);
        const blocking = blockingCountFromSummary(finalSummary);
        if (signedOff === "signed_off_clean") {
            if (blocking !== null && blocking > 0) {
                blockers.push(`G-${phase} proof: signed_off_clean but final round blocking_count is ${blocking}`);
            }
            else if (blocking === null) {
                blockers.push(`G-${phase} proof: signed_off_clean requires final round_summary.blocking_count === 0`);
            }
            else {
                gatesPassed.push(`G-${phase}-iteration-clean`);
            }
        }
        if (signedOff === "signed_off_with_compromises" && maxRound < spec.maxRounds) {
            warnings.push(`G-${phase} proof: signed_off_with_compromises before round ${spec.maxRounds} — ensure compromises[] logged`);
        }
        gatesPassed.push(`G-${phase}-iteration`);
    }
    return { blockers, warnings, gatesPassed };
}
