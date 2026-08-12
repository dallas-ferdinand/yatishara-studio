import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderMarkdownFragment } from "./mos-markdown.js";
import { normalizeMarkdown } from "./markdown-normalize.js";

function assertFast(label, fn, maxMs = 500) {
  const t0 = Date.now();
  const out = fn();
  const ms = Date.now() - t0;
  assert.ok(ms < maxMs, `${label} took ${ms}ms`);
  return out;
}

describe("mos-markdown Script references", () => {
  it("renders asset:// list links without hanging", () => {
    const md = `# Prompt

\`\`\`text
A short prompt body.
\`\`\`

## References

- [headphones.jpeg](asset://jd7am24yp42sfj3nqa4499c0an8cbm50) — product reference
`;
    const html = assertFast("asset link render", () => renderMarkdownFragment(md));
    assert.match(html, /headphones\.jpeg/);
    assert.match(html, /<ul>/);
  });

  it("still renders task checkboxes", () => {
    const html = renderMarkdownFragment("- [ ] open\n- [x] done");
    assert.match(html, /type="checkbox"/);
    assert.match(html, /checked/);
  });

  it("does not hang on bare pipe soup or long separator rows", () => {
    assertFast("onlyPipes", () => normalizeMarkdown("|".repeat(80)));
    assertFast(
      "longSep",
      () =>
        normalizeMarkdown(
          `| ${Array.from({ length: 24 }, () => "---").join(" | ")} |`
        )
    );
    assertFast("gluedSep", () => normalizeMarkdown("|---|---|Hello world"));
  });

  it("keeps list meta rows out of tables", () => {
    const md =
      "- headphones.jpeg | kind: image | path: /Studio/x | studio: jd7\n";
    const html = assertFast("pipe meta", () => renderMarkdownFragment(md));
    assert.equal(html.includes("<table"), false);
    assert.match(html, /headphones\.jpeg/);
  });
});
