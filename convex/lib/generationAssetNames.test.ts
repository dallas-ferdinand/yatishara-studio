import { describe, expect, it } from "vitest";
import {
  generationAssetFileName,
  promptSnippetForName,
  shortUniqueToken,
} from "./generationAssetNames";

describe("generationAssetNames", () => {
  it("strips references and placeholders from prompt snippets", () => {
    expect(
      promptSnippetForName(
        "\uFFFC make a sunny kitchen splash for Degreaser\n\nReferences:\n- @flyer.png | kind: image",
      ),
    ).toMatch(/sunny kitchen splash/i);
  });

  it("builds unique image names from prompts", () => {
    const a = generationAssetFileName({
      kind: "image",
      prompt: "Caribbean family pizza night in a bright kitchen",
      uniqueId: "jd7abc123xyz",
      extension: "png",
    });
    const b = generationAssetFileName({
      kind: "image",
      prompt: "Caribbean family pizza night in a bright kitchen",
      uniqueId: "jd7abc999zzz",
      extension: "png",
    });
    expect(a).toMatch(/Caribbean Family Pizza Night/i);
    expect(a).toMatch(/· [a-zA-Z0-9]{4,}\.png$/);
    expect(a).not.toBe(b);
    expect(a).not.toBe("generated-image-1.png");
  });

  it("names voiceovers with voice + script snippet + unique token", () => {
    const name = generationAssetFileName({
      kind: "audio",
      prompt: "Order sushi wraps now for weekend specials",
      voiceName: "Jessica - Playful, Bright, Warm",
      uniqueId: "jobvoice01",
      extension: "mp3",
    });
    expect(name).toContain("Jessica");
    expect(name).not.toContain("Playful");
    expect(name).toMatch(/Order Sushi Wraps/i);
    expect(name).toMatch(/· [a-zA-Z0-9]+\.mp3$/);
    expect(name).not.toBe("Jessica - Playful, Bright, Warm voiceover");
  });

  it("names videos and multi-image indices distinctly", () => {
    const video = generationAssetFileName({
      kind: "video",
      prompt: "excavator yard establishing shot",
      uniqueId: "vidjob99",
      extension: "mp4",
    });
    const second = generationAssetFileName({
      kind: "image",
      prompt: "excavator yard establishing shot",
      uniqueId: "imgjob99",
      index: 2,
      extension: "png",
    });
    expect(video).toMatch(/\.mp4$/);
    expect(video).not.toMatch(/^generated-video-/);
    expect(second).toContain(" 2 ·");
  });

  it("falls back when prompt is empty but still unique", () => {
    const name = generationAssetFileName({
      kind: "image",
      prompt: "",
      uniqueId: "empty001",
      extension: "png",
    });
    expect(name).toMatch(/^Image · .+\.png$/);
    expect(shortUniqueToken("abc123xyz")).toBe("123xyz");
  });
});
