import { describe, expect, it } from "vitest";
import {
  buildPromptDocumentMarkdown,
  collectAssetIdsFromReferences,
  hydrateComposerFromText,
  looksLikePromptScript,
  parsePromptDocument,
} from "./promptReferences";

describe("promptReferences", () => {
  it("parses trailing References block", () => {
    const md = `A woman walks to the sink.

References:
- @hero | kind: image | path: /Studio/assets/abc123.png | studio: abc123
- @logo | kind: image | path: /Studio/assets/logo99 | studio: logo99
`;
    const parsed = parsePromptDocument(md);
    expect(parsed.body).toContain("woman walks");
    expect(parsed.references).toHaveLength(2);
    expect(collectAssetIdsFromReferences(parsed.references)).toEqual([
      "abc123",
      "logo99",
    ]);
  });

  it("parses ## References and skips elements", () => {
    const md = `# Prompt

Hello

## References
- @still | kind: image | path: /Studio/assets/a1 | studio: a1
- @maya | kind: context | element: character | path: /Studio/elements/e1.element | studio: e1
`;
    const hydrated = hydrateComposerFromText(md, [
      {
        _id: "a1",
        name: "still.png",
        kind: "image",
        signedThumbnailUrl: "https://cdn/t",
      },
    ]);
    expect(hydrated.attachments).toHaveLength(1);
    expect(hydrated.attachments[0]?.studioId).toBe("a1");
    expect(hydrated.draftWithMarkers.startsWith("\uFFFC")).toBe(true);
  });

  it("detects prompt scripts for paste", () => {
    expect(looksLikePromptScript("just text")).toBe(false);
    expect(
      looksLikePromptScript(
        "hi\n\nReferences:\n- @x | kind: image | path: /Studio/assets/z | studio: z",
      ),
    ).toBe(true);
  });

  it("builds agent-style prompt documents", () => {
    const out = buildPromptDocumentMarkdown(
      "Subject: hero.\nCamera: locked.",
      [{ label: "hero", kind: "image", studioId: "id1", studioKind: "asset" }],
      { title: "Prompt — hero" },
    );
    expect(out).toContain("```text");
    expect(out).toContain("studio: id1");
    const again = parsePromptDocument(out);
    expect(again.references[0]?.studioId).toBe("id1");
  });
});
