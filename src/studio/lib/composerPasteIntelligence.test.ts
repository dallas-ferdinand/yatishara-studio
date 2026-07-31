import { describe, expect, it } from "vitest";
import {
  htmlToPlainText,
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
});
