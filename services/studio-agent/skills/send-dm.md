---
id: send-dm
title: Send a DM
when: User wants to message someone in Studio DMs
tools: studio_send_message, studio_send_media_message
category: ops
---

# Send DM

- Text → `studio_send_message { conversationId, body }`
- Media → `studio_send_media_message { conversationId, assetId|assetIds }`
- Outbound needs approval unless YOLO is on.
