import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
function registerMessageTools(server) {
  server.tool(
    "studio_list_conversations",
    "List DM conversations (newest first). Optional labelId filters to peers in that label. Requires messages scope.",
    { labelId: z.string().optional() },
    async ({ labelId }) => {
      const query = labelId ? `?labelId=${encodeURIComponent(labelId)}` : "";
      return jsonResult(await studioFetch(`/messages/conversations${query}`));
    }
  );
  server.tool(
    "studio_search_messages",
    "Unified DM sidebar search: people, chats, message bodies, and labels. Requires messages scope.",
    { q: z.string() },
    async ({ q }) => jsonResult(
      await studioFetch(`/messages/search?q=${encodeURIComponent(q)}`)
    )
  );
  server.tool(
    "studio_unread_count",
    "Count conversations with unseen inbound messages. Requires messages scope.",
    {},
    async () => jsonResult(await studioFetch("/messages/unread-count"))
  );
  server.tool(
    "studio_open_conversation",
    "Open or create a DM conversation with a public profile username. Requires messages scope.",
    { username: z.string() },
    async ({ username }) => jsonResult(
      await studioFetch("/messages/conversations", {
        method: "POST",
        body: JSON.stringify({ username })
      })
    )
  );
  server.tool(
    "studio_list_messages",
    "List messages in a conversation (oldest \u2192 newest). Optional limit (default 120, max 200). Requires messages scope.",
    {
      conversationId: z.string(),
      limit: z.number().int().positive().optional()
    },
    async ({ conversationId, limit }) => {
      const query = limit !== void 0 ? `?limit=${encodeURIComponent(String(limit))}` : "";
      return jsonResult(
        await studioFetch(
          `/messages/conversations/${encodeURIComponent(conversationId)}/messages${query}`
        )
      );
    }
  );
  server.tool(
    "studio_send_message",
    "Send a text DM. Optional replyToMessageId for quote-reply. Requires messages scope.",
    {
      conversationId: z.string(),
      body: z.string(),
      replyToMessageId: z.string().optional()
    },
    async ({ conversationId, body, replyToMessageId }) => jsonResult(
      await studioFetch(
        `/messages/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            body,
            ...replyToMessageId ? { replyToMessageId } : {}
          })
        }
      )
    )
  );
  server.tool(
    "studio_send_image_message",
    "Send an image DM using a billable Studio image asset (Messages folder). Optional caption + reply. Requires messages scope.",
    {
      conversationId: z.string(),
      assetId: z.string(),
      caption: z.string().optional(),
      replyToMessageId: z.string().optional()
    },
    async ({ conversationId, assetId, caption, replyToMessageId }) => jsonResult(
      await studioFetch(
        `/messages/conversations/${encodeURIComponent(conversationId)}/images`,
        {
          method: "POST",
          body: JSON.stringify({
            assetId,
            ...caption !== void 0 ? { caption } : {},
            ...replyToMessageId ? { replyToMessageId } : {}
          })
        }
      )
    )
  );
  server.tool(
    "studio_send_voice_message",
    "Send a voice DM using a billable Studio audio asset in the Messages folder. durationSec is client-measured length (1s\u2013300s). Optional reply. Requires messages scope.",
    {
      conversationId: z.string(),
      assetId: z.string(),
      durationSec: z.number().positive(),
      replyToMessageId: z.string().optional()
    },
    async ({ conversationId, assetId, durationSec, replyToMessageId }) => jsonResult(
      await studioFetch(
        `/messages/conversations/${encodeURIComponent(conversationId)}/voice`,
        {
          method: "POST",
          body: JSON.stringify({
            assetId,
            durationSec,
            ...replyToMessageId ? { replyToMessageId } : {}
          })
        }
      )
    )
  );
  server.tool(
    "studio_edit_message",
    "Edit your own text DM or photo caption. Requires messages scope.",
    {
      messageId: z.string(),
      body: z.string()
    },
    async ({ messageId, body }) => jsonResult(
      await studioFetch(
        `/messages/messages/${encodeURIComponent(messageId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ body })
        }
      )
    )
  );
  server.tool(
    "studio_delete_message",
    "Delete a DM. scope=me hides for you only; scope=everyone (sender only) tombstones for both. Requires messages scope.",
    {
      messageId: z.string(),
      scope: z.enum(["me", "everyone"]).optional()
    },
    async ({ messageId, scope }) => jsonResult(
      await studioFetch(
        `/messages/messages/${encodeURIComponent(messageId)}/delete`,
        {
          method: "POST",
          body: JSON.stringify({ scope: scope ?? "me" })
        }
      )
    )
  );
  server.tool(
    "studio_share_post_to_dm",
    "Share a feed post (or comment) into a DM conversation. Requires messages scope.",
    {
      conversationId: z.string(),
      postId: z.string(),
      commentId: z.string().optional(),
      note: z.string().optional()
    },
    async ({ conversationId, postId, commentId, note }) => jsonResult(
      await studioFetch(
        `/messages/conversations/${encodeURIComponent(conversationId)}/share`,
        {
          method: "POST",
          body: JSON.stringify({
            postId,
            ...commentId ? { commentId } : {},
            ...note !== void 0 ? { note } : {}
          })
        }
      )
    )
  );
  server.tool(
    "studio_mark_conversation_read",
    "Mark a DM conversation as read (advances read + delivery watermarks). Requires messages scope.",
    { conversationId: z.string() },
    async ({ conversationId }) => jsonResult(
      await studioFetch(
        `/messages/conversations/${encodeURIComponent(conversationId)}/read`,
        { method: "POST", body: JSON.stringify({}) }
      )
    )
  );
  server.tool(
    "studio_list_dm_labels",
    "List the caller's DM labels (lists). Requires messages scope.",
    {},
    async () => jsonResult(await studioFetch("/messages/labels"))
  );
  server.tool(
    "studio_create_dm_label",
    "Create a DM label. icon must be a known Lucide-style slug (tag, heart, star, \u2026). Requires messages scope.",
    { name: z.string(), icon: z.string() },
    async ({ name, icon }) => jsonResult(
      await studioFetch("/messages/labels", {
        method: "POST",
        body: JSON.stringify({ name, icon })
      })
    )
  );
  server.tool(
    "studio_update_dm_label",
    "Rename or change icon on a DM label. Requires messages scope.",
    {
      labelId: z.string(),
      name: z.string().optional(),
      icon: z.string().optional()
    },
    async ({ labelId, name, icon }) => jsonResult(
      await studioFetch(`/messages/labels/${encodeURIComponent(labelId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...name !== void 0 ? { name } : {},
          ...icon !== void 0 ? { icon } : {}
        })
      })
    )
  );
  server.tool(
    "studio_delete_dm_label",
    "Delete a DM label and its memberships. Requires messages scope.",
    { labelId: z.string() },
    async ({ labelId }) => jsonResult(
      await studioFetch(`/messages/labels/${encodeURIComponent(labelId)}`, {
        method: "DELETE"
      })
    )
  );
  server.tool(
    "studio_list_peer_labels",
    "List which of the caller's labels are assigned to a peer. Requires messages scope.",
    { peerUserId: z.string() },
    async ({ peerUserId }) => jsonResult(
      await studioFetch(
        `/messages/peers/${encodeURIComponent(peerUserId)}/labels`
      )
    )
  );
  server.tool(
    "studio_set_peer_labels",
    "Replace which labels a peer belongs to (full set). Requires messages scope.",
    {
      peerUserId: z.string(),
      labelIds: z.array(z.string())
    },
    async ({ peerUserId, labelIds }) => jsonResult(
      await studioFetch(
        `/messages/peers/${encodeURIComponent(peerUserId)}/labels`,
        {
          method: "PUT",
          body: JSON.stringify({ labelIds })
        }
      )
    )
  );
  server.tool(
    "studio_peer_panel",
    "DM peer sidebar payload: profile, seller tag, labels, block state. Requires messages scope.",
    { peerUserId: z.string() },
    async ({ peerUserId }) => jsonResult(
      await studioFetch(
        `/messages/peers/${encodeURIComponent(peerUserId)}/panel`
      )
    )
  );
  server.tool(
    "studio_list_peer_notes",
    "List private notes about a peer. Requires messages scope.",
    { peerUserId: z.string() },
    async ({ peerUserId }) => jsonResult(
      await studioFetch(
        `/messages/peers/${encodeURIComponent(peerUserId)}/notes`
      )
    )
  );
  server.tool(
    "studio_add_peer_note",
    "Add a private note about a peer. Requires messages scope.",
    { peerUserId: z.string(), body: z.string() },
    async ({ peerUserId, body }) => jsonResult(
      await studioFetch(
        `/messages/peers/${encodeURIComponent(peerUserId)}/notes`,
        {
          method: "POST",
          body: JSON.stringify({ body })
        }
      )
    )
  );
  server.tool(
    "studio_update_peer_note",
    "Update a private peer note by noteId. Requires messages scope.",
    { noteId: z.string(), body: z.string() },
    async ({ noteId, body }) => jsonResult(
      await studioFetch(`/messages/notes/${encodeURIComponent(noteId)}`, {
        method: "PATCH",
        body: JSON.stringify({ body })
      })
    )
  );
  server.tool(
    "studio_delete_peer_note",
    "Delete a private peer note. Requires messages scope.",
    { noteId: z.string() },
    async ({ noteId }) => jsonResult(
      await studioFetch(`/messages/notes/${encodeURIComponent(noteId)}`, {
        method: "DELETE"
      })
    )
  );
  server.tool(
    "studio_block_peer",
    "Block a peer (they cannot DM you). Requires messages scope.",
    { peerUserId: z.string() },
    async ({ peerUserId }) => jsonResult(
      await studioFetch(
        `/messages/peers/${encodeURIComponent(peerUserId)}/block`,
        { method: "POST", body: JSON.stringify({}) }
      )
    )
  );
  server.tool(
    "studio_unblock_peer",
    "Unblock a peer. Requires messages scope.",
    { peerUserId: z.string() },
    async ({ peerUserId }) => jsonResult(
      await studioFetch(
        `/messages/peers/${encodeURIComponent(peerUserId)}/unblock`,
        { method: "POST", body: JSON.stringify({}) }
      )
    )
  );
}
export {
  registerMessageTools
};
