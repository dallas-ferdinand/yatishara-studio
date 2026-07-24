import { describe, expect, it } from "vitest";
import {
  collectStudioAssetIdsFromPrompt,
  threadTitleFromPrompt,
} from "./studio-prompt-display.js";

describe("threadTitleFromPrompt", () => {
  it("strips object-replacement placeholders from tab titles", () => {
    expect(
      threadTitleFromPrompt("\uFFFC help me make an amazing hypermotion flyer"),
    ).toBe("help me make an amazing hypermotion flyer");
  });

  it("ignores the References block and falls back to the first attachment label", () => {
    expect(
      threadTitleFromPrompt(
        "\uFFFC\n\nReferences:\n- @generated-image-1.png | kind: image",
        [{ label: "generated-image-1.png" }],
      ),
    ).toBe("generated-image-1.png");
  });

  it("uses a reference label when the body is empty", () => {
    expect(
      threadTitleFromPrompt(
        "\n\nReferences:\n- @flyer.png | kind: image | thumb: https://example.com/t.jpg",
      ),
    ).toBe("flyer.png");
  });
});

describe("collectStudioAssetIdsFromPrompt", () => {
  it("reads studio ids and /Studio/assets paths from reference lines", () => {
    expect(
      collectStudioAssetIdsFromPrompt(
        [
          "use this logo",
          "",
          "References:",
          "- @logo.png | kind: image | path: /Studio/assets/jd7abc123 | studio: jd7abc123",
          "- @other.png | kind: image | path: /Studio/assets/jd7other99.png",
        ].join("\n"),
      ),
    ).toEqual(["jd7abc123", "jd7other99"]);
  });

  it("ignores element reference chips so assets.listByIds is not fed element ids", () => {
    expect(
      collectStudioAssetIdsFromPrompt(
        [
          "use this character",
          "",
          "References:",
          "- @Maya | kind: context | element: character | path: /Studio/elements/ks75yx14gdxspzh2nsg11xhw2d8ajy70 | studio: ks75yx14gdxspzh2nsg11xhw2d8ajy70",
          "- @logo.png | kind: image | path: /Studio/assets/jd7abc123 | studio: jd7abc123",
        ].join("\n"),
      ),
    ).toEqual(["jd7abc123"]);
  });
});
