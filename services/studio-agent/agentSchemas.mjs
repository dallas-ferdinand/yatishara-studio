/**
 * Strict-ish arg checks for high-value Studio tools (agent surface).
 */

import { sanitizeScriptMarkdown } from "./scriptMarkdown.mjs";

/** @type {Record<string, { required: string[], oneOfGroups?: string[][], enums?: Record<string, string[]> }>} */
export const HOT_SCHEMAS = {
  studio_share_asset_post: { required: ["assetId"] },
  studio_unshare_post: { required: ["assetId"] },
  studio_generate_image: { required: ["prompt"] },
  studio_generate_video: { required: ["prompt"] },
  studio_estimate_generation: { required: ["mode"] },
  studio_bulk_move: { required: ["targetFolderId", "items"] },
  studio_trash: {
    required: ["kind", "id"],
    enums: { kind: ["folder", "asset", "document", "element"] },
  },
  studio_send_message: { required: ["conversationId", "body"] },
  studio_send_media_message: {
    required: ["conversationId"],
    oneOfGroups: [["assetId"], ["assetIds"], ["items"]],
  },
  studio_create_folder: { required: ["name"] },
  studio_create_element: {
    required: ["type", "name"],
    enums: { type: ["character", "prop", "location", "doc"] },
  },
  studio_update_element: { required: ["elementId"] },
  studio_create_document: { required: ["title", "contentMarkdown"] },
  studio_folder_contents: { required: ["folderId"] },
  studio_view_media: { required: ["assetId"] },
  studio_get_asset: { required: ["assetId"] },
  studio_is_asset_shared: { required: ["assetId"] },
  studio_search: { required: ["query"] },
};

/**
 * @param {string} toolName
 * @param {Record<string, unknown>} args
 * @returns {{ ok: true, args: Record<string, unknown> } | { ok: false, error: string, example?: object }}
 */
export function validateHotToolArgs(toolName, args) {
  const schema = HOT_SCHEMAS[toolName];
  if (!schema) return { ok: true, args: args || {} };
  const input = args && typeof args === "object" && !Array.isArray(args) ? { ...args } : {};

  for (const key of schema.required) {
    const value = input[key];
    if (value == null || value === "") {
      return {
        ok: false,
        error: `${toolName} requires args.${key}`,
        example: exampleFor(toolName),
      };
    }
  }

  if (schema.enums) {
    for (const [key, allowed] of Object.entries(schema.enums)) {
      if (input[key] != null && !allowed.includes(String(input[key]))) {
        return {
          ok: false,
          error: `${toolName} args.${key} must be one of: ${allowed.join("|")}`,
          example: exampleFor(toolName),
        };
      }
    }
  }

  if (schema.oneOfGroups?.length) {
    const hit = schema.oneOfGroups.some((group) =>
      group.every((key) => {
        const value = input[key];
        if (Array.isArray(value)) return value.length > 0;
        return value != null && value !== "";
      }),
    );
    if (!hit) {
      return {
        ok: false,
        error: `${toolName} requires one of: ${schema.oneOfGroups
          .map((g) => g.join("+"))
          .join(" | ")}`,
        example: exampleFor(toolName),
      };
    }
  }

  if (toolName === "studio_bulk_move") {
    if (!Array.isArray(input.items) || !input.items.length) {
      return {
        ok: false,
        error: "studio_bulk_move requires non-empty args.items",
        example: exampleFor(toolName),
      };
    }
    for (const [index, item] of input.items.entries()) {
      if (!item || typeof item !== "object") {
        return { ok: false, error: `items[${index}] must be {kind,id}` };
      }
      if (!item.id || !item.kind) {
        return {
          ok: false,
          error: `items[${index}] needs kind + id (kind=asset|document|element|folder)`,
        };
      }
    }
  }

  if (toolName === "studio_generate_image" || toolName === "studio_generate_video") {
    if (String(input.prompt).trim().length < 2) {
      return { ok: false, error: `${toolName} prompt too short` };
    }
  }

  if (toolName === "studio_create_document") {
    // Alias common mis-keys before empty check
    if (
      (input.contentMarkdown == null || input.contentMarkdown === "") &&
      typeof input.content === "string"
    ) {
      input.contentMarkdown = input.content;
      delete input.content;
    }
    if (
      (input.contentMarkdown == null || input.contentMarkdown === "") &&
      typeof input.markdown === "string"
    ) {
      input.contentMarkdown = input.markdown;
      delete input.markdown;
    }
    const title = String(input.title ?? "").trim();
    if (!title) {
      return {
        ok: false,
        error: "studio_create_document requires args.title",
        example: exampleFor(toolName),
      };
    }
    input.title = title;
    input.contentMarkdown = sanitizeScriptMarkdown(input.contentMarkdown);
    const body = String(input.contentMarkdown ?? "").trim();
    if (!body || body.length < 20) {
      return {
        ok: false,
        error:
          "studio_create_document requires non-empty contentMarkdown (full prompt/script body, not a stub)",
        example: exampleFor(toolName),
      };
    }
  }

  if (toolName === "studio_update_document" && input.contentMarkdown != null) {
    input.contentMarkdown = sanitizeScriptMarkdown(input.contentMarkdown);
  }

  return { ok: true, args: input };
}

function exampleFor(toolName) {
  const examples = {
    studio_share_asset_post: { assetId: "<assetId>", caption: "optional" },
    studio_generate_image: { prompt: "…", folderId: "<optional>" },
    studio_generate_video: { prompt: "…", folderId: "<optional>" },
    studio_create_document: {
      folderId: "<CWD>",
      title: "Prompt — short name",
      contentMarkdown:
        "# Prompt — short name\n\n```text\n…sealed prompt…\n```\n\n## References\n\n- [Label](asset://{assetId}) — optional note\n",
    },
    studio_bulk_move: {
      targetFolderId: "<folderId>",
      items: [{ kind: "asset", id: "<id>" }],
    },
    studio_trash: { kind: "asset", id: "<id>" },
    studio_send_message: { conversationId: "<id>", body: "hello" },
    studio_send_media_message: { conversationId: "<id>", assetId: "<assetId>" },
    studio_create_folder: { name: "New folder" },
  };
  return examples[toolName];
}
