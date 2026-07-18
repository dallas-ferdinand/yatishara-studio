import { describe, expect, it } from "vitest";
import { threadTitleFromPrompt } from "./studio-prompt-display.js";

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
