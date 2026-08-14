import { describe, expect, it } from "vitest";
import {
  flattenPastedHtmlInComposer,
  htmlToPlainText,
  isRichComposerInputType,
  looksLikeHtmlMarkup,
  normalizePastedPlainText,
  plainTextFromClipboard,
} from "./composerPasteIntelligence";

describe("composerPasteIntelligence", () => {
  it("detects HTML markup masquerading as plain text", () => {
    expect(looksLikeHtmlMarkup('<div class="x"><p>Hello</p></div>')).toBe(true);
    expect(looksLikeHtmlMarkup("Hello world")).toBe(false);
    expect(looksLikeHtmlMarkup("a < b and c > d")).toBe(false);
  });

  it("normalizes clipboard noise", () => {
    expect(normalizePastedPlainText("  hello\u200B  \n\n\n  world  ")).toBe(
      "hello\n\nworld",
    );
  });

  it("converts HTML to plain text", () => {
    expect(htmlToPlainText("<p>Hello</p><p>World</p>")).toMatch(/Hello/);
    expect(htmlToPlainText("<p>Hello</p><p>World</p>")).toMatch(/World/);
    expect(htmlToPlainText("<p>Hello</p><p>World</p>")).not.toMatch(/</);
  });

  it("prefers plain text when clean", () => {
    const cd = {
      getData: (f: string) =>
        f === "text/plain" ? "Clean copy" : f === "text/html" ? "<b>Clean copy</b>" : "",
    };
    expect(plainTextFromClipboard(cd)).toBe("Clean copy");
  });

  it("falls back from HTML when plain empty", () => {
    const cd = {
      getData: (f: string) => (f === "text/html" ? "<p>Only html</p>" : ""),
    };
    expect(plainTextFromClipboard(cd)).toBe("Only html");
  });

  it("strips HTML when plain is markup", () => {
    const markup = "<div><span>Pastable</span></div>";
    const cd = {
      getData: (f: string) =>
        f === "text/plain" ? markup : f === "text/html" ? markup : "",
    };
    expect(plainTextFromClipboard(cd)).toBe("Pastable");
  });

  it("flags rich clipboard input types", () => {
    expect(isRichComposerInputType("insertFromPaste")).toBe(true);
    expect(isRichComposerInputType("insertHTML")).toBe(true);
    expect(isRichComposerInputType("formatBold")).toBe(true);
    expect(isRichComposerInputType("insertText")).toBe(false);
    expect(isRichComposerInputType("insertParagraph")).toBe(false);
  });

  it("flattens pasted HTML wrappers and keeps chips", () => {
    if (typeof document === "undefined") return;
    const root = document.createElement("div");
    root.innerHTML =
      '<div><span style="color:red">Hello</span></div><span class="studio-inline-tag" data-attachment-id="x">@chip</span>';
    expect(flattenPastedHtmlInComposer(root)).toBe(true);
    expect(root.querySelector("span[style]")).toBeNull();
    expect(root.querySelector("div")).toBeNull();
    expect(root.textContent).toContain("Hello");
    expect(root.querySelector(".studio-inline-tag")?.textContent).toBe("@chip");
  });
});
