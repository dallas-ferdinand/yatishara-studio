import { describe, expect, it } from "vitest";
import { formatPostWhen } from "./formatPostWhen";

describe("formatPostWhen", () => {
  const now = Date.parse("2026-07-27T12:00:00.000Z");

  it("shows relative ago · short date", () => {
    expect(formatPostWhen(now - 30_000, now)).toMatch(/^just now · /);
    expect(formatPostWhen(now - 5 * 60_000, now)).toMatch(/^5m ago · /);
    expect(formatPostWhen(now - 3 * 60 * 60_000, now)).toMatch(/^3h ago · /);
    expect(formatPostWhen(now - 12 * 24 * 60 * 60_000, now)).toMatch(/^12d ago · /);
    expect(formatPostWhen(now - 29 * 24 * 60 * 60_000, now)).toMatch(/^29d ago · /);
  });

  it("keeps ago · date past one month", () => {
    const older = now - 45 * 24 * 60 * 60_000;
    const label = formatPostWhen(older, now);
    expect(label).toMatch(/^45d ago · /);
    expect(label).toContain(" · ");
  });

  it("includes year when the post is not in the current year", () => {
    const lastYear = Date.parse("2025-03-15T12:00:00.000Z");
    const label = formatPostWhen(lastYear, now);
    expect(label).toMatch(/ago · /);
    expect(label).toMatch(/2025/);
  });
});
