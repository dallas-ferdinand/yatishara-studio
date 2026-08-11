---
id: move-items
title: Move items into a folder
when: User says move/put/place items into a folder
tools: studio_bulk_move, studio_folder_contents
category: ops
---

# Move items

1. Build items from attached chips: `{ kind: studioKind, id: studioId }`.
2. `studio_bulk_move { targetFolderId, items }`.
3. Optional verify: `studio_folder_contents { folderId: targetFolderId }`.
