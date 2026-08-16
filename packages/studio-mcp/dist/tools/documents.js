import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
function registerDocumentTools(server) {
  server.tool(
    "studio_get_document",
    "Get a document by ID including markdown content.",
    { documentId: z.string() },
    async ({ documentId }) => jsonResult(await studioFetch(`/documents/${encodeURIComponent(documentId)}`))
  );
  server.tool(
    "studio_create_document",
    "Create a markdown document in a folder. Requires write scope.",
    {
      folderId: z.string().optional(),
      title: z.string(),
      contentMarkdown: z.string().optional()
    },
    async ({ folderId, title, contentMarkdown }) => jsonResult(
      await studioFetch("/documents", {
        method: "POST",
        body: JSON.stringify({ folderId, title, contentMarkdown })
      })
    )
  );
  server.tool(
    "studio_update_document",
    "Rename a document (title), replace full markdown content, or move it to another folder. For small inline edits prefer studio_patch_document (search/replace) to save tokens. Requires write scope.",
    {
      documentId: z.string(),
      title: z.string().optional(),
      contentMarkdown: z.string().optional(),
      folderId: z.string().optional()
    },
    async ({ documentId, title, contentMarkdown, folderId }) => jsonResult(
      await studioFetch(`/documents/${encodeURIComponent(documentId)}`, {
        method: "PATCH",
        body: JSON.stringify({ title, contentMarkdown, folderId })
      })
    )
  );
  server.tool(
    "studio_patch_document",
    "Apply exact search/replace edit(s) to a document's markdown (coding-agent style). Prefer this over studio_update_document for small changes. Pass oldString+newString, or edits[{oldString,newString,replaceAll?}]. Fails if oldString missing or ambiguous (unless replaceAll). Requires write scope.",
    {
      documentId: z.string(),
      oldString: z.string().optional(),
      newString: z.string().optional(),
      replaceAll: z.boolean().optional(),
      edits: z.array(
        z.object({
          oldString: z.string(),
          newString: z.string(),
          replaceAll: z.boolean().optional()
        })
      ).optional()
    },
    async ({ documentId, oldString, newString, replaceAll, edits }) => jsonResult(
      await studioFetch(
        `/documents/${encodeURIComponent(documentId)}/patch`,
        {
          method: "POST",
          body: JSON.stringify({ oldString, newString, replaceAll, edits })
        }
      )
    )
  );
}
export {
  registerDocumentTools
};
