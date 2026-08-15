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
      "abc123def456",
      "jd788wn7ppv9t3qjtc3jjq9pd18cb68z",
    ]);
    expect(hydrated.body).toContain("@flyer");
    expect(hydrated.draftWithMarkers.startsWith("\uFFFC")).toBe(true);
  });

  it("hydrates ## References element:// markdown links", () => {
    const md = `# Prompt — bottle

\`\`\`text
@bottle Product on a dark table.
\`\`\`

## References

- [bottle](element://elbottle1) — product lock
`;
    expect(looksLikePromptScript(md)).toBe(true);
    const hydrated = hydrateComposerFromText(
      md,
      [],
      [{ _id: "elbottle1", name: "bottle", type: "prop", thumbnailUrl: "https://cdn/t" }],
    );
    expect(hydrated.attachments).toHaveLength(1);
    expect(hydrated.attachments[0]?.studioKind).toBe("element");
    expect(hydrated.attachments[0]?.studioId).toBe("elbottle1");
    expect(hydrated.body).toContain("@bottle");
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
    expect(hydrated.draftWithMarkers.startsWith("\uFFFC")).toBe(true);
    expect(hydrated.draftWithMarkers).not.toContain("@product-shot");
  });

  it("hydrates @tag, with a trailing comma", () => {
    const md = `@product-shot, Hypermotion ad on a table.`;
    const hydrated = hydrateComposerFromText(md, [], [
      {
        _id: "el1",
        name: "product-shot",
        type: "prop",
        thumbnailUrl: "https://cdn/t",
      },
    ]);
    expect(hydrated.attachments).toHaveLength(1);
    expect(hydrated.attachments[0]?.label).toBe("product-shot");
    expect(hydrated.draftWithMarkers).toBe("\uFFFC, Hypermotion ad on a table.");
  });

  it("parses reference lines that trail a comma after the @tag", () => {
    const md = `Shot.

References:
- @bottle,
`;
    const parsed = parsePromptDocument(md);
    expect(parsed.references[0]?.label).toBe("bottle");
  });

  it("places a mid-prompt @tag chip where the tag was, not at the start", () => {
    const md = `A woman holds @bottle in the kitchen.`;
    const hydrated = hydrateComposerFromText(md, [], [
      { _id: "elbottle1", name: "bottle", type: "prop" },
    ]);
    expect(hydrated.attachments).toHaveLength(1);
    expect(hydrated.draftWithMarkers).toBe(`A woman holds \uFFFC in the kitchen.`);
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

  it("hydrates @untitled.element from the element id", () => {
    const hydrated = hydrateComposerFromText(
      "Use @untitled.element in the shot.",
      [],
      [{ _id: "e9", name: "untitled", type: "prop" }],
    );
    expect(hydrated.attachments).toHaveLength(1);
    expect(hydrated.attachments[0]?.studioKind).toBe("element");
    expect(hydrated.attachments[0]?.label).toBe("untitled");
    expect(hydrated.draftWithMarkers).toBe("Use \uFFFC in the shot.");
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
    expect(
      looksLikePromptScript(
        "## References\n\n- [bottle](element://elbottle1)\n",
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

  it("builds element:// links for element attachments", () => {
    const out = buildPromptDocumentMarkdown(
      "Hypermotion with the bottle.",
      [{ label: "bottle", studioId: "el1", studioKind: "element" }],
      { title: "Prompt — bottle" },
    );
    expect(out).toContain("element://el1");
    expect(out).toContain("@bottle");
    const hydrated = hydrateComposerFromText(
      out,
      [],
      [{ _id: "el1", name: "bottle", type: "prop" }],
    );
    expect(hydrated.attachments[0]?.studioKind).toBe("element");
  });
});
