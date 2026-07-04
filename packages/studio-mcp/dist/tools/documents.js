import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
export function registerDocumentTools(server) {
    server.tool("studio_get_document", "Get a document by ID including markdown content.", { documentId: z.string() }, async ({ documentId }) => jsonResult(await studioFetch(`/documents/${encodeURIComponent(documentId)}`)));
    server.tool("studio_create_document", "Create a markdown document in a folder. Requires write scope.", {
        folderId: z.string().optional(),
        title: z.string(),
        contentMarkdown: z.string().optional(),
    }, async ({ folderId, title, contentMarkdown }) => jsonResult(await studioFetch("/documents", {
        method: "POST",
        body: JSON.stringify({ folderId, title, contentMarkdown }),
    })));
    server.tool("studio_update_document", "Rename a document (title), edit markdown content, or move it to another folder. Requires write scope.", {
        documentId: z.string(),
        title: z.string().optional(),
        contentMarkdown: z.string().optional(),
        folderId: z.string().optional(),
    }, async ({ documentId, title, contentMarkdown, folderId }) => jsonResult(await studioFetch(`/documents/${encodeURIComponent(documentId)}`, {
        method: "PATCH",
        body: JSON.stringify({ title, contentMarkdown, folderId }),
    })));
}
