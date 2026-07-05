import { v } from "convex/values";
import { authedQuery } from "./lib/customFunctions";
import {
  COMPOSER_SCRIPT_TYPES,
  COMPOSER_SCRIPT_TYPE_SLUGS,
} from "./lib/composerScriptTypes";
import { REFERENCE_INTENT_SLUGS } from "./lib/referenceIntent";

const scriptTypeReturn = v.object({
  slug: v.string(),
  label: v.string(),
  description: v.string(),
  includesGenerationPrompt: v.boolean(),
  includesStoryboardPrompt: v.boolean(),
});

const referenceIntentReturn = v.object({
  slug: v.string(),
  label: v.string(),
  description: v.string(),
});

const REFERENCE_INTENT_LABELS: Record<
  (typeof REFERENCE_INTENT_SLUGS)[number],
  { label: string; description: string }
> = {
  auto: {
    label: "Auto",
    description: "Infer from preset and attachments — stylize for cartoon presets, match for Direct.",
  },
  stylize: {
    label: "Stylize to preset",
    description: "Use uploads for identity cues; render in the active cartoon look.",
  },
  match_reference: {
    label: "Match reference",
    description: "Preserve photographic fidelity from uploads — no cartoon restyle.",
  },
  element_lock: {
    label: "Element lock",
    description: "Built element sheets and bibles are canonical; stylize per preset without drift.",
  },
};

export const listScriptTypes = authedQuery({
  args: {},
  returns: v.array(scriptTypeReturn),
  handler: async () =>
    COMPOSER_SCRIPT_TYPES.map((item) => ({
      slug: item.slug,
      label: item.label,
      description: item.description,
      includesGenerationPrompt: item.includesGenerationPrompt,
      includesStoryboardPrompt: item.includesStoryboardPrompt,
    })),
});

export const listReferenceIntents = authedQuery({
  args: {},
  returns: v.array(referenceIntentReturn),
  handler: async () =>
    REFERENCE_INTENT_SLUGS.map((slug) => ({
      slug,
      label: REFERENCE_INTENT_LABELS[slug].label,
      description: REFERENCE_INTENT_LABELS[slug].description,
    })),
});

export const scriptTypeSlugs = COMPOSER_SCRIPT_TYPE_SLUGS;
