/**
 * First-class typed Studio tools for Pi — Cursor-style, not catalog→invoke.
 * Long-tail tools still go through catalog / describe / invoke.
 */
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { INTENT_BLURBS, agentDescription } from "./agentLanes.mjs";
import { getTool } from "../../packages/studio-tools/src/catalog.js";

const extra = { additionalProperties: true };

function obj(props) {
  return Type.Object(props, extra);
}

const optStr = (description) => Type.Optional(Type.String({ description }));
const optNum = (description) => Type.Optional(Type.Number({ description }));
const optBool = (description) => Type.Optional(Type.Boolean({ description }));

/** @type {Array<{ name: string, label: string, parameters: import("typebox").TObject }>} */
export const DIRECT_TOOL_SPECS = [
  {
    name: "studio_generate_image",
    label: "Generate image",
    parameters: obj({
      prompt: Type.String({ description: "Image prompt" }),
      folderId: optStr("Save folder; default CWD"),
      referenceAssetIds: Type.Optional(Type.Array(Type.String())),
      referenceElementIds: Type.Optional(Type.Array(Type.String())),
    }),
  },
  {
    name: "studio_generate_video",
    label: "Generate video",
    parameters: obj({
      prompt: Type.String({ description: "Video prompt" }),
      folderId: optStr("Save folder; default CWD"),
      videoModel: optStr("e.g. seedance-2.5"),
      durationSeconds: optNum(),
      aspectRatio: optStr(),
      referenceAssetIds: Type.Optional(Type.Array(Type.String())),
      referenceElementIds: Type.Optional(Type.Array(Type.String())),
      startFrameAssetId: optStr(),
    }),
  },
  {
    name: "studio_generate_audio",
    label: "Generate audio",
    parameters: obj({
      prompt: Type.String(),
      audioType: Type.Optional(
        Type.Union([
          Type.Literal("voiceover"),
          Type.Literal("sfx"),
          Type.Literal("music"),
        ]),
      ),
      folderId: optStr(),
      elevenVoiceId: optStr(),
    }),
  },
  {
    name: "studio_generate_batch",
    label: "Generate batch",
    parameters: obj({
      items: Type.Array(
        Type.Object({
          mode: Type.String({ description: "image | video | audio" }),
          prompt: Type.String(),
          folderId: optStr(),
        }),
      ),
    }),
  },
  {
    name: "studio_estimate_generation",
    label: "Estimate generation",
    parameters: obj({
      mode: Type.String({ description: "image | video | audio" }),
      prompt: optStr(),
    }),
  },
  {
    name: "studio_get_generation",
    label: "Get generation",
    parameters: obj({
      jobId: Type.String(),
    }),
  },
  {
    name: "studio_list_generations",
    label: "List generations",
    parameters: obj({
      folderId: optStr(),
      limit: optNum(),
    }),
  },
  {
    name: "studio_list_video_models",
    label: "List video models",
    parameters: obj({}),
  },
  {
    name: "studio_explore_voices",
    label: "Explore voices",
    parameters: obj({
      q: optStr(),
    }),
  },
  {
    name: "studio_create_document",
    label: "Create document",
    parameters: obj({
      title: Type.String(),
      contentMarkdown: Type.String({ description: "Non-empty markdown body" }),
      folderId: optStr("Default CWD"),
    }),
  },
  {
    name: "studio_get_document",
    label: "Read document",
    parameters: obj({
      documentId: Type.String(),
    }),
  },
  {
    name: "studio_patch_document",
    label: "Patch document",
    parameters: obj({
      documentId: Type.String(),
      oldString: optStr("Exact existing snippet"),
      newString: optStr("Replacement"),
    }),
  },
  {
    name: "studio_update_document",
    label: "Update document",
    parameters: obj({
      documentId: Type.String(),
      title: optStr(),
      contentMarkdown: optStr(),
      folderId: optStr(),
    }),
  },
  {
    name: "studio_create_element",
    label: "Create element",
    parameters: obj({
      type: Type.String({ description: "character | prop | location | doc" }),
      name: Type.String({ description: "Unique @name, no spaces" }),
      folderId: optStr(),
      description: optStr(),
      referenceAssetIds: Type.Optional(Type.Array(Type.String())),
      sheetAssetId: optStr(),
    }),
  },
  {
    name: "studio_list_elements",
    label: "List elements",
    parameters: obj({
      folderId: optStr(),
      type: optStr(),
    }),
  },
  {
    name: "studio_get_element",
    label: "Get element",
    parameters: obj({
      elementId: Type.String(),
    }),
  },
  {
    name: "studio_update_element",
    label: "Update element",
    parameters: obj({
      elementId: Type.String(),
      name: optStr(),
      description: optStr(),
      referenceAssetIds: Type.Optional(Type.Array(Type.String())),
    }),
  },
  {
    name: "studio_workspace_tree",
    label: "Workspace tree",
    parameters: obj({}),
  },
  {
    name: "studio_folder_contents",
    label: "Folder contents",
    parameters: obj({
      folderId: Type.String(),
    }),
  },
  {
    name: "studio_list_folders",
    label: "List folders",
    parameters: obj({
      parentId: optStr(),
    }),
  },
  {
    name: "studio_create_folder",
    label: "Create folder",
    parameters: obj({
      name: Type.String(),
      parentId: optStr(),
    }),
  },
  {
    name: "studio_ensure_path",
    label: "Ensure path",
    parameters: obj({
      path: Type.String({ description: "Folder path to create" }),
    }),
  },
  {
    name: "studio_search",
    label: "Search",
    parameters: obj({
      query: Type.String(),
      kinds: Type.Optional(Type.Array(Type.String())),
      limit: optNum(),
    }),
  },
  {
    name: "studio_get_asset",
    label: "Get asset",
    parameters: obj({
      assetId: Type.String(),
    }),
  },
  {
    name: "studio_view_media",
    label: "View media URLs",
    parameters: obj({
      assetId: Type.String(),
    }),
  },
  {
    name: "studio_pull_frames",
    label: "Pull video frames",
    parameters: obj({
      assetId: Type.String(),
      count: optNum(),
      startSec: optNum(),
      endSec: optNum(),
    }),
  },
  {
    name: "studio_trash",
    label: "Trash",
    parameters: obj({
      kind: Type.Optional(
        Type.String({ description: "folder | asset | document | element" }),
      ),
      id: optStr(),
      collection: optStr(),
      documentId: optStr(),
      assetId: optStr(),
      folderId: optStr(),
      elementId: optStr(),
    }),
  },
  {
    name: "studio_restore",
    label: "Restore",
    parameters: obj({
      kind: optStr(),
      id: optStr(),
    }),
  },
  {
    name: "studio_bulk_move",
    label: "Move items",
    parameters: obj({
      targetFolderId: Type.String(),
      items: Type.Array(
        Type.Object({
          kind: Type.String(),
          id: Type.String(),
        }),
      ),
    }),
  },
  {
    name: "studio_share_asset_post",
    label: "Post to profile",
    parameters: obj({
      assetId: Type.String(),
      caption: optStr(),
    }),
  },
  {
    name: "studio_send_message",
    label: "Send DM",
    parameters: obj({
      conversationId: Type.String(),
      body: Type.String(),
    }),
  },
  {
    name: "studio_send_media_message",
    label: "Send media DM",
    parameters: obj({
      conversationId: Type.String(),
      assetId: optStr(),
      assetIds: Type.Optional(Type.Array(Type.String())),
    }),
  },
];

export const DIRECT_TOOL_NAMES = DIRECT_TOOL_SPECS.map((spec) => spec.name);

/**
 * @param {{ executeNamed: (toolCallId: string, name: string, args: Record<string, unknown>, onUpdate?: Function) => Promise<unknown> }} opts
 */
export function createDirectStudioTools(opts) {
  return DIRECT_TOOL_SPECS.map((spec) => {
    const catalogTool = getTool(spec.name);
    const description =
      INTENT_BLURBS[spec.name] ||
      (catalogTool ? agentDescription(catalogTool) : spec.label);
    return defineTool({
      name: spec.name,
      label: spec.label,
      description,
      promptSnippet: spec.label,
      parameters: spec.parameters,
      async execute(toolCallId, params, _signal, onUpdate) {
        return opts.executeNamed(
          toolCallId,
          spec.name,
          params && typeof params === "object" ? params : {},
          onUpdate,
        );
      },
    });
  });
}
