<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Yatishara Studio — Agent rules

## Design system (mandatory for any UI/CSS work)

Before touching chrome UI, tokens, CSS, or shared components, read
`docs/DESIGN_SYSTEM.md`. It is the source of truth for shade scale
(`--mos-page` / `--mos-plate` / `--mos-plate-strong`), borders, radius, typography,
and the shared components (`CursorSelect`, `CursorTable`).

**When a design pattern solidifies** (Dallas confirms a shade/border/component choice),
update `docs/DESIGN_SYSTEM.md` **and** MercuryOS memory in the same turn — do not leave
docs/memory stale. Never bake light-only greys or hardcoded `#fff`/`#000` borders into
chrome. Dropdowns: panel level-2 `--mos-plate` (tight, shadow, no border); button
level-3 `--mos-plate-strong` at rest; item hover/active level-3; caret = Lucide
`ArrowDown`. Keep section bars `overflow: visible` so menus are not clipped.

## Local commits (multitask-safe)

- Prefer committing **your own** finished slices locally; never push unless Dallas asks.
- **Do not** force end-of-turn commits when another agent’s files are also dirty — continuous commit pressure races multitasking chats.
- Stage only paths from this turn; leave other chats’ in-flight work alone. `wip:` OK for your half-finished experiments.
- This repo opts out of the user-level `COMMIT REQUIRED` nudge via `.cursor/no-auto-commit`.
- Full text: `.cursor/rules/frequent-local-commits.mdc` (alwaysApply). Memory: pinned **670**.
