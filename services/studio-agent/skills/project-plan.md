---
id: project-plan
title: Studio project plan docs
when: Multi-step creative job, campaign folder, or user asks to plan then continue later
tools: studio_ensure_path, studio_create_document, studio_patch_document, studio_update_document, studio_search, studio_folder_contents, plan
category: workflow
---

# Studio project plans

Prefer **Studio documents in the project folder** over ephemeral chat memory so later turns can reopen the plan.

## When to plan

- 3+ steps, or work that will span turns  
- One-shot post/move/send → skip; just invoke  

## Setup

1. `studio_ensure_path` for the project folder if needed  
2. `studio_create_document` titled `Plan` (or `Shot list`) in that folder  
3. Optional short in-turn `plan` tool checklist for the current run only  

## Plan doc body (template)

```text
Goal:
Folder:

Steps:
1. [ ] …
2. [ ] …
3. [ ] …

Assets / refs:
- …

Prompt notes:
- Register: cinematic | hypermotion | image
- Model: seedance-2.5 | seedance-2.0 | image
- Aspect:

Done when:
-
```

## Later turns

- `studio_search` / `studio_folder_contents` → open the Plan doc  
- `studio_patch_document` to check off steps / small prompt edits; `studio_update_document` for full rewrites or rename/move  
- `remember` only for durable prefs, not the whole shot list  

## Empty files

Yes — create empty or stub docs/folders first (`studio_create_document`, `studio_ensure_path`), then fill as work proceeds.
