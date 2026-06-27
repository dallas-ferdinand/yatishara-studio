# mos-ui System Reference

MercuryOS Desk renders fenced `mos-ui` JSON into safe interactive UI. The gateway prompt in `05-projects/mercuryos-phone/gateway/desk-context.mjs` should stay aligned with this reference.

## Components

- `stack`, `group`: combine blocks.
- `page`, `landing`, `website`: website-like layouts with nav, hero, sections, CTAs, and media sidecars.
- `hero`, `spotlight`, `dashboard`, `section`, `card`, `grid`, `bento`, `banner`: primary content surfaces.
- `gallery`, `media-row`, `journey`, `image`, `video`, `audio`, `pdf`, `embed`, `compare`: media, carousels, previews, and horizontal stories.
- `creative-panel`, `form`, `select`, `action-menu`: user input and controls.
- `file-list`, `breadcrumb`, `artifact-grid`, `links`: workspace navigation and clickable deliverables.
- `kv`, `stat-row`, `timeline`, `checklist`, `kanban`, `pricing`, `testimonials`, `prompt-chips`, `chips`, `quote`, `divider`, `progress`, `table`, `tabs`, `accordion`: structured display.
- `empty`, `loading`: empty and waiting states.

## Rich Layout Patterns

Use these to avoid flat chatbot replies. Substantial answers should read like small app screens: result first, proof second, openable files third, next actions last. Each section should have a different job and visual role: poster hero, asymmetric bento, instrument stats, workspace objects, horizontal journey, or dense controls. Keep it professional: clear title, short subtitle, one primary action, proof before detail, no walls of text, no decorative filler.

Do not be stingy with components. A non-trivial rich reply should use 4-7 sections from different families: a primary surface (`page`, `hero`, `spotlight`), proof/data (`stat-row`, `kv`, `progress`), structure/detail (`bento`, `dashboard`, `section`, `table`, `checklist`, `timeline`, `kanban`, `journey`), controls (`tabs`, `accordion`, `form`, `select`, `action-menu`), openables (`file-list`, `artifact-grid`, `breadcrumb`), and continuation (`prompt-chips`, `chips`, `banner`). Use specialist components when relevant: `gallery`, `media-row`, `compare`, `pricing`, `testimonials`, `research-os`, `router-map`, `source-grid`, `creative-panel`.

```json
{ "type": "page", "brand": "MercuryOS", "eyebrow": "Launch", "title": "App-like answer", "subtitle": "Hero, proof, sections, files, and CTAs in one organized surface.", "nav": [
  { "label": "Open project", "action": "open-dir", "path": "05-projects/mercuryos-desk-next" }
], "sections": [
  { "type": "stat-row", "items": [{ "label": "Proof", "value": "Passed" }] },
  { "type": "bento", "title": "What changed", "items": [{ "title": "Layout", "body": "Richer page composition.", "span": "wide" }] },
  { "type": "artifact-grid", "title": "Openables", "items": [{ "title": "Renderer", "path": "05-projects/mercuryos-desk-next/src/mos-shared/mos-ui-render.js", "kind": "file", "tags": ["renderer"], "status": "done" }] },
  { "type": "prompt-chips", "title": "Next", "items": [{ "label": "Show files", "message": "Open the changed files" }] }
] }
```

```json
{ "type": "spotlight", "eyebrow": "Launch", "title": "Campaign ready", "body": "One clear outcome with supporting proof.", "stats": [{ "label": "Assets", "value": "12" }], "actions": [] }
```

```json
{ "type": "bento", "title": "What changed", "items": [
  { "title": "Hero asset", "body": "Generated and linked.", "span": "wide" },
  { "title": "Tests", "body": "Lint passed.", "tone": "success" }
] }
```

```json
{ "type": "journey", "title": "Next path", "items": [
  { "title": "Draft", "body": "Collect inputs." },
  { "title": "Review", "body": "Compare options." },
  { "title": "Ship", "body": "Publish final." }
] }
```

```json
{ "type": "prompt-chips", "title": "Continue", "mode": "send", "items": [
  { "label": "Make it more visual", "message": "Improve this with richer gallery UI" },
  { "label": "Add actions", "message": "Add useful action buttons" }
] }
```

Other new blocks:

- `page` / `landing` / `website`: default for substantial answers. Use a hero, proof stats, bento sections, openable files, and prompt chips.
- `bento`: default content organizer for work summaries, comparisons, feature groups, and proof cards.
- `artifact-grid` / `links`: clickable files, folders, docs, generated assets, reports, and URLs.
- `stat-row`: instrument cluster for proof and counts; place before details.
- `journey`: horizontal story for process, roadmap, migration, or next path.
- `tabs` / `accordion`: dense controls and grouped details; avoid long plain lists.
- Good rich reply rhythm: `page` hero -> `stat-row` proof -> `bento` summary -> `file-list`/`artifact-grid` openables -> `prompt-chips` continuation.
- Keep copy friendly and concise. Prefer 3-6 strong sections over many weak cards.
- Do not use one long card per paragraph/message for structured data. Ledgers, expenses, payments, inbox logs, statuses, tasks, counts, and comparisons should become `stat-row`, `table`, `checklist`, `kv`, `tabs`, or `dashboard` blocks.
- Cards are short tiles: title plus 1-2 concise lines. If copy needs more space, move dense detail into `accordion`, `table`, or `checklist`.
- Add `actions`, `status`, `tags`, `meta`, and `badge` where useful so UI feels complete and scannable.
- Prefer clear verbs in actions: Open, Review, Run, Continue, Copy.
- Component-mix rule: before emitting mos-ui, pick at least one primary surface, one proof/data component, one structure/detail component, one action/openable component, and one continuation component. Add the domain-specific component when work is visual, data-heavy, process-heavy, research-oriented, or control-oriented.
- `checklist`: tasks with `status`: `done`, `active`, `error`, `pending`.
- `kanban`: columns with cards for workflow boards.
- `pricing`: plan cards with `price`, `period`, `features`, `actions`, `featured`.
- `testimonial` / `testimonials`: quote cards with optional avatar/image.
- `gallery` supports `variant`: `grid`, `masonry`, `polaroid`, `showcase`.

## Actions

Buttons use:

```json
{ "label": "Run", "action": "api", "api": "health", "payload": {}, "result": "inline" }
```

Supported `action` values:

- `open-file`, `open-dir`, `open-raw`
- `url`
- `copy`
- `composer` / `fill`
- `send` / `chat`
- `event`
- `api` / `mos-api`

Button metadata:

- `payload` / `body` / `params`: API payload object.
- `result`: `inline`, `composer`, `fill`, `send`, `chat`, `copy`, `none`.
- `confirm`: confirmation prompt for risky actions.
- `variant` / `tone`: visual treatment.
- `successLabel`, `failureLabel`: temporary click feedback.

## mos-api Names

System/status: `health`, `gateway-logs`, `models`, `app-build-status`, `app-build`, `agent-prefs`, `set-agent-prefs`

Pulse: `pulse-status`, `pulse-settings`, `pulse-run`

Memory/media: `add-memory`, `generate-image`

Workspaces: `workspaces`, `add-workspace`, `discover-workspaces`, `update-workspace`, `remove-workspace`, `sessions`

MCP: `mcps`, `mcp-enable`, `mcp-disable`, `mcp-login`

Runs: `runs`, `run-history`, `run-fetch`, `run-cancel`, `run-reset-agent`

Git: `git-status`, `git-graph`, `git-stage`, `git-unstage`, `git-discard`, `git-commit`, `git-generate-message`, `git-pull`, `git-push`, `git-checkpoint`, `git-revert`

Files: `list-files`, `search-files`, `read-file`, `create-dir`, `write-file`, `delete-file`, `rename-file`

## File And Folder Links

Use `file-list` when listing changed files. Use `artifact-grid` when a file, folder, URL, generated media, or report is a deliverable. Rows/cards auto-style icons by file extension or `kind`. Each item can include `tags`, `status`, `meta`, or `badge` for visible pills:

```json
{ "title": "Open renderer", "path": "05-projects/mercuryos-desk-next/src/mos-shared/mos-ui-render.js", "kind": "file", "description": "Renderer source", "tags": ["code", "renderer"], "status": "done" }
```

Folders use `"kind": "dir"` or `"type": "dir"`. URLs use `"href"` / `"url"`.

Auth/integrations: `cursor-status`, `cursor-login`, `cursor-save-key`, `higgsfield-status`, `higgsfield-login`, `tiktok-status`, `tiktok-status-health`, `tiktok-disconnect`

Access: `access-pending`, `access-approve`, `access-deny`

## Safety

Use `confirm` for any action that writes, deletes, renames, stages, commits, pulls, pushes, builds, enables/disables integrations, logs in, disconnects, approves, or denies.

Never place secrets in visible fields, card bodies, payload examples, copied text, or inline results.
