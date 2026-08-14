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

  it("parses ## References asset:// markdown links (agent scripts)", () => {
    const md = `# Prompt — flyer

\`\`\`text
@flyer Product on a dark table.
\`\`\`

## References

- [flyer](asset://jd788wn7ppv9t3qjtc3jjq9pd18cb68z) — product reference
- [hero](asset://abc123def456) — face lock
`;
    expect(looksLikePromptScript(md)).toBe(true);
    const hydrated = hydrateComposerFromText(md, [
      {
        _id: "jd788wn7ppv9t3qjtc3jjq9pd18cb68z",
        name: "flyer.png",
        kind: "image",
        signedThumbnailUrl: "https://cdn/t",
      },
      {
        _id: "abc123def456",
        name: "hero.png",
        kind: "image",
      },
    ]);
    expect(hydrated.attachments).toHaveLength(2);
    expect(hydrated.attachments.map((a) => a.studioId)).toEqual([
      "jd788wn7ppv9t3qjtc3jjq9pd18cb68z",
      "abc123def456",
    ]);
    expect(hydrated.body).toContain("@flyer");
    expect(hydrated.draftWithMarkers.startsWith("\uFFFC")).toBe(true);
  });

  it("hydrates element @tags from the prompt body", () => {
    const md = `@product-shot Hypermotion ad on a table.`;
    const hydrated = hydrateComposerFromText(md, [], [
      {
        _id: "el1",
        name: "product-shot",
        type: "prop",
        thumbnailUrl: "https://cdn/t",
      },
    ]);
    expect(hydrated.attachments).toHaveLength(1);
    expect(hydrated.attachments[0]?.studioKind).toBe("element");
    expect(hydrated.attachments[0]?.label).toBe("product-shot");
  });

  it("parses ## References including elements when catalog is passed", () => {
    const md = `# Prompt

Hello

## References
- @still | kind: image | path: /Studio/assets/a1 | studio: a1
- @maya | kind: context | element: character | path: /Studio/elements/e1.element | studio: e1
`;
    const hydrated = hydrateComposerFromText(
      md,
      [
        {
          _id: "a1",
          name: "still.png",
          kind: "image",
          signedThumbnailUrl: "https://cdn/t",
        },
      ],
      [{ _id: "e1", name: "maya", type: "character" }],
    );
    expect(hydrated.attachments).toHaveLength(2);
    expect(hydrated.attachments.map((item) => item.studioKind)).toEqual([
      "asset",
      "element",
    ]);
    expect(hydrated.draftWithMarkers.startsWith("\uFFFC")).toBe(true);
  });

  it("detects prompt scripts for paste", () => {
    expect(looksLikePromptScript("just text")).toBe(false);
    expect(
      looksLikePromptScript(
        "hi\n\nReferences:\n- @x | kind: image | path: /Studio/assets/z | studio: z",
      ),
    ).toBe(true);
    expect(
      looksLikePromptScript(
        "## References\n\n- [x](asset://abc123)\n",
      ),
    ).toBe(true);
  });

  it("injects missing @Label mentions for Higgs-style body", () => {
    const md = `\`\`\`text
Product on marble.
\`\`\`

## References

- [Bottle](asset://bottleid1)
`;
    const hydrated = hydrateComposerFromText(md, [
      { _id: "bottleid1", name: "bottle.png", kind: "image" },
    ]);
    expect(hydrated.body.startsWith("@Bottle")).toBe(true);
    expect(hydrated.body).toContain("Product on marble");
  });

  it("builds agent-style prompt documents", () => {
    const out = buildPromptDocumentMarkdown(
      "Subject: hero.\nCamera: locked.",
      [{ label: "hero", kind: "image", studioId: "id1", studioKind: "asset" }],
      { title: "Prompt — hero" },
    );
    expect(out).toContain("```text");
    expect(out).toContain("asset://id1");
    expect(out).toContain("@hero");
    const again = parsePromptDocument(out);
    expect(again.references[0]?.studioId).toBe("id1");
  });
});
