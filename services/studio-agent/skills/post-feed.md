---
id: post-feed
title: Post to public profile
when: User wants to post/share/publish an owned image or video to the feed
tools: studio_share_asset_post, studio_is_asset_shared
category: ops
---

# Post to feed

1. Use attached asset id (or search if none).
2. `invoke studio_share_asset_post { assetId, caption? }`.
3. If approval appears, stop — chat UI handles it.
4. After ok, `studio_is_asset_shared { assetId }` before claiming posted.
