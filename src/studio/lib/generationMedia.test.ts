import { describe, expect, it } from "vitest";
import {
  attachmentComposerTag,
  pickGenerationUrl,
  splitVideoGenerationInputs,
} from "./generationMedia";

describe("generationMedia", () => {
  it("never picks a Bunny thumb URL", () => {
    const thumb =
      "https://cdn.example.com/file.jpg?width=225&quality=58&token=abc";
    const full = "https://cdn.example.com/file.jpg?width=8192&quality=100&token=xyz";
    expect(pickGenerationUrl({ thumbnailUrl: thumb, mediaUrl: thumb })).toBeUndefined();
    expect(pickGenerationUrl({ signedUrl: full, thumbnailUrl: thumb })).toBe(full);
  });

  it("uses element reference photos, not thumbs, and orders images before video", () => {
    const { referenceInputs } = splitVideoGenerationInputs(
      [
        {
          id: "el1",
          studioKind: "element",
          label: "product-shot",
          kind: "context",
          referenceAssets: [
            {
              studioId: "a1",
              kind: "image",
              mediaUrl: "https://cdn.example.com/product.png",
            },
          ],
        },
        {
          id: "vid",
          studioKind: "asset",
          kind: "video",
          filename: "motion.mp4",
          mediaUrl: "https://cdn.example.com/motion.mp4",
        },
        {
          id: "img",
          studioKind: "asset",
          kind: "image",
          filename: "baseball-shot.jpg",
          mediaUrl: "https://cdn.example.com/baseball.jpg",
        },
      ],
      {
        "element-media:el1": "https://cdn.example.com/product-signed.png",
      },
    );
    expect(referenceInputs.map((item) => item.kind)).toEqual(["image", "image", "video"]);
    expect(referenceInputs[0]?.url).toBe("https://cdn.example.com/product-signed.png");
    expect(referenceInputs[0]?.tag).toBe("product-shot");
    expect(referenceInputs[1]?.tag).toBe("baseball-shot.jpg");
  });

  it("tags files as filename.ext and elements as unique-id", () => {
    expect(
      attachmentComposerTag({
        studioKind: "asset",
        filename: "Hero Shot.PNG",
      }),
    ).toBe("Hero-Shot.PNG");
    expect(
      attachmentComposerTag({ studioKind: "element", label: "@baseball-shot" }),
    ).toBe("baseball-shot");
    expect(
      attachmentComposerTag({
        studioKind: "element",
        filename: "untitled.element",
      }),
    ).toBe("untitled");
  });
});
