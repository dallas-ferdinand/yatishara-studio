import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
const elementType = z.enum(["character", "prop", "location", "doc"]);
const CREATE_ELEMENT_GUIDE = "Creates the element record ONLY (buildStatus=unbuilt) — does not build a sheet image. " +
    "Before calling: read studio_element_sheet_guide. " +
    "sourceMode photographic = real person/object + upload referenceAssetIds. " +
    "sourceMode designed = fictional character/prop/location + rich description — NO photo refs, NO throwaway plates before generate-sheet.";
const GENERATE_SHEET_GUIDE = "BUILDS the reference sheet image (GPT Image 2) and sets sheetAssetId (buildStatus=built). " +
    "designed: one call from description — no reference photos required. " +
    "photographic: uses referenceAssetIds (upload photos). " +
    "location designed: pass referenceElementIds with built prop sheets to compose set dressing. " +
    "For video gen use referenceElementIds — never raw upload refs.";
const GENERATE_TEXT_SHEET_GUIDE = "Generates the markdown production bible (description) from reference photos. " +
    "Does not build the sheet image — call studio_generate_element_sheet after. " +
    "Parity with Studio UI Build sheet text step.";
const stylePresetSheetFieldDesc = "Style slug: unstyled|raw (photoreal reference sheet, no cartoon stylization), or toon-prime (default cartoon), toon-adult|toon-surreal|toon-family|toon-cgi|toon-neon-idol";
const UPDATE_ELEMENT_GUIDE = "Update referenceAssetIds (upload photos only — never include sheetAssetId). " +
    "Rebuild sheet after changing refs.";
export function registerElementTools(server) {
    server.tool("studio_production_guide", "READ FIRST for character/prop/location pipelines. Explains unbuilt vs built states, when to use sheet vs upload refs, and direct-prompt generation defaults (unstyled + skipPromptEnhancement — no Flash rewrite before Seedance).", {}, async () => jsonResult(await studioFetch("/elements/production-guide")));
    server.tool("studio_element_sheet_guide", "READ FIRST before character/prop/location sheets. Returns min/recommended reference photo counts, upload checklist, fidelity locks, output layout, and step-by-step MCP workflow.", {
        type: elementType.exclude(["doc"]).optional().describe("character, prop, or location — omit to return all three guides"),
    }, async ({ type }) => {
        if (!type) {
            return jsonResult({
                character: (await studioFetch("/elements/sheet-guide?type=character")).guide,
                prop: (await studioFetch("/elements/sheet-guide?type=prop")).guide,
                location: (await studioFetch("/elements/sheet-guide?type=location")).guide,
                production: (await studioFetch("/elements/production-guide")).guide,
                note: "Workflow: upload refs → create_element (unbuilt) → generate_text_sheet (optional) → generate_element_sheet (built). Generation uses sheet only.",
            });
        }
        return jsonResult(await studioFetch(`/elements/sheet-guide?type=${encodeURIComponent(type)}`));
    });
    server.tool("studio_list_elements", "List creative elements (characters, props, locations, docs). Filter by folderId or type.", {
        type: elementType.optional(),
        folderId: z.string().optional(),
    }, async ({ type, folderId }) => {
        const params = new URLSearchParams();
        if (type)
            params.set("type", type);
        if (folderId)
            params.set("folderId", folderId);
        const query = params.toString() ? `?${params.toString()}` : "";
        return jsonResult(await studioFetch(`/elements${query}`));
    });
    server.tool("studio_get_element", "Get an element by ID. Returns buildStatus, referenceAssetIds (upload refs), sheetAssetId/sheetUrl (built sheet).", { elementId: z.string() }, async ({ elementId }) => jsonResult(await studioFetch(`/elements/${encodeURIComponent(elementId)}`)));
    server.tool("studio_create_element", CREATE_ELEMENT_GUIDE, {
        type: elementType,
        name: z.string(),
        description: z.string().optional(),
        folderId: z.string().optional(),
        referenceAssetIds: z
            .array(z.string())
            .optional()
            .describe("Upload photo asset IDs — see studio_element_sheet_guide for minimum counts"),
        sourceAssetIds: z
            .array(z.string())
            .optional()
            .describe("Deprecated alias for referenceAssetIds"),
        sourceDocumentId: z.string().optional(),
        sourceMode: z
            .enum(["photographic", "designed"])
            .optional()
            .describe("photographic = real subject with upload refs. designed = fictional asset from description only (no throwaway plates)."),
    }, async ({ type, name, description, folderId, referenceAssetIds, sourceAssetIds, sourceDocumentId, sourceMode }) => jsonResult(await studioFetch("/elements", {
        method: "POST",
        body: JSON.stringify({
            type,
            name,
            description,
            folderId,
            referenceAssetIds: referenceAssetIds ?? sourceAssetIds,
            sourceDocumentId,
            sourceMode,
        }),
    })));
    server.tool("studio_update_element", UPDATE_ELEMENT_GUIDE, {
        elementId: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        folderId: z.string().optional(),
        referenceAssetIds: z.array(z.string()).optional(),
        sourceAssetIds: z.array(z.string()).optional(),
        sourceDocumentId: z.string().optional(),
    }, async ({ elementId, name, description, folderId, referenceAssetIds, sourceAssetIds, sourceDocumentId }) => jsonResult(await studioFetch(`/elements/${encodeURIComponent(elementId)}`, {
        method: "PATCH",
        body: JSON.stringify({
            name,
            description,
            folderId,
            referenceAssetIds: referenceAssetIds ?? sourceAssetIds,
            sourceDocumentId,
        }),
    })));
    server.tool("studio_generate_element_text_sheet", GENERATE_TEXT_SHEET_GUIDE, {
        elementId: z.string(),
        referenceAssetIds: z
            .array(z.string())
            .optional()
            .describe("Override element referenceAssetIds"),
    }, async ({ elementId, referenceAssetIds }) => jsonResult(await studioFetch(`/elements/${encodeURIComponent(elementId)}/generate-text-sheet`, {
        method: "POST",
        body: JSON.stringify({ referenceAssetIds }),
    })));
    server.tool("studio_generate_element_sheet", GENERATE_SHEET_GUIDE, {
        elementId: z.string(),
        referenceAssetIds: z
            .array(z.string())
            .optional()
            .describe("Override element referenceAssetIds for sheet build (photographic mode)"),
        referenceElementIds: z
            .array(z.string())
            .optional()
            .describe("Built prop/character element IDs to attach when composing location sheets"),
        sourceMode: z
            .enum(["photographic", "designed"])
            .optional()
            .describe("Override element sourceMode for this sheet build"),
        resolution: z.enum(["1K", "2K"]).optional(),
        stylePresetSlug: z
            .string()
            .optional()
            .describe(stylePresetSheetFieldDesc),
    }, async ({ elementId, referenceAssetIds, referenceElementIds, sourceMode, resolution, stylePresetSlug }) => jsonResult(await studioFetch(`/elements/${encodeURIComponent(elementId)}/generate-sheet`, {
        method: "POST",
        body: JSON.stringify({
            referenceAssetIds,
            referenceElementIds,
            sourceMode,
            resolution,
            stylePresetSlug,
        }),
    })));
}
