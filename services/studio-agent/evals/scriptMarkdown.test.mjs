import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeScriptMarkdown } from "../scriptMarkdown.mjs";

test("sanitize converts pipe-meta refs to asset:// markdown links", () => {
  const raw = `# Prompt — Test

\`\`\`text
Hello world prompt body here for length.
\`\`\`

References:
- headphones.jpeg | kind: image | path: /Studio/Bone Conduction Headphones Ad/headphones.jpeg | file: headphones.jpeg | studio: jd7am24yp42sfj3nqa4499c0an8cbm50
`;
  const out = sanitizeScriptMarkdown(raw);
  assert.match(out, /## References/);
  assert.match(out, /\[headphones\.jpeg\]\(asset:\/\/jd7am24yp42sfj3nqa4499c0an8cbm50\)/);
  assert.equal(out.includes("| kind:"), false);
});

test("sanitize strips null bytes and closes open fences", () => {
  const out = sanitizeScriptMarkdown("```text\nhello\u0000world");
  assert.equal(out.includes("\u0000"), false);
  assert.match(out, /```\s*$/);
});

test("sanitize is idempotent on clean markdown", () => {
  const clean = `# Prompt — Clean

\`\`\`text
Sealed prompt body with enough characters.
\`\`\`

## References

- [Flyer](asset://jd788wn7ppv9t3qjtc3jjq9pd18cb68z) — product reference
`;
  const once = sanitizeScriptMarkdown(clean);
  const twice = sanitizeScriptMarkdown(once);
  assert.equal(once, twice);
});
