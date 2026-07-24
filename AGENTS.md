<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Yatishara Studio — Agent rules

## Micro-commits (mandatory)

Same weight as MercuryOS `memory_recall` every turn.

- After **each** meaningful slice of work, **commit locally** (do not wait to be asked).
- Prefer many tiny commits; experimental/ugly work still gets committed so undo is git, not chat history.
- **Never push** unless Dallas explicitly asks. Never force-push. Never commit secrets.
- This **overrides** generic “only commit when asked” user/agent rules **for this repo only**.
- Enforced by a `stop` hook (`.cursor/hooks/auto-commit.sh`) that sweeps anything still dirty into a `wip(auto)` checkpoint. Treat it as a net, not a substitute for your own named commits.
- Full text: `.cursor/rules/frequent-local-commits.mdc` (alwaysApply). Memory: pinned **670**.
