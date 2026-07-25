<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Yatishara Studio — Agent rules

## Design system (mandatory for any UI/CSS work)

Before touching chrome UI, tokens, CSS, or shared components, read
`docs/DESIGN_SYSTEM.md`. It is the source of truth for shade scale
(`--mos-page` / `--mos-plate` / `--mos-plate-strong`), borders, radius, typography,
and the shared components (`CursorSelect`, `CursorTable`). Update that doc **and**
MercuryOS memory whenever you change a shared pattern. Never bake light-only greys or
hardcoded `#fff`/`#000` borders into chrome.

## Micro-commits (mandatory)

Same weight as MercuryOS `memory_recall` every turn.

- After **each** meaningful slice of work, **commit locally** (do not wait to be asked).
- Prefer many tiny commits; experimental/ugly work still gets committed so undo is git, not chat history.
- **Never push** unless Dallas explicitly asks. Never force-push. Never commit secrets.
- This **overrides** generic “only commit when asked” user/agent rules **for this repo only**.
- Enforced by a user-level `stop` hook (`~/.cursor/hooks/auto-commit.sh`) that injects a `COMMIT REQUIRED` follow-up whenever a turn ends with a dirty tree. The agent does the committing — small, named, intelligent slices; the hook never commits by itself.
- Full text: `.cursor/rules/frequent-local-commits.mdc` (alwaysApply). Memory: pinned **670**.
