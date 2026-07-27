import { describe, expect, it } from "vitest";
import {
  backdropFromImageData,
  backdropFromLuminance,
  relativeLuminance,
} from "./captionBackdropContrast";

function fakeImageData(
  colors: Array<[number, number, number]>,
): ImageData {
  // backdropFromImageData strides by 4 pixels (16 bytes) — pack RGBA densely.
  const data = new Uint8ClampedArray(colors.length * 4);
  for (let i = 0; i < colors.length; i += 1) {
    const [r, g, b] = colors[i]!;
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  return { data, width: colors.length, height: 1, colorSpace: "srgb" } as ImageData;
}

describe("captionBackdropContrast", () => {
  it("treats near-white stage as light backdrop", () => {
    const luma = relativeLuminance(245, 245, 247);
    expect(luma).toBeGreaterThan(0.9);
    expect(backdropFromLuminance(luma)).toBe("light");
  });

  it("treats near-black letterbox as dark backdrop", () => {
    const luma = relativeLuminance(5, 6, 8);
    expect(luma).toBeLessThan(0.05);
    expect(backdropFromLuminance(luma)).toBe("dark");
  });

  it("thresholds mid greys consistently", () => {
    expect(backdropFromLuminance(0.7)).toBe("light");
    expect(backdropFromLuminance(0.4)).toBe("dark");
  });

  it("preferDark stays dark when mean luma would tip light from sky highlights", () => {
    // ~65% near-white sky + 35% dark media: average → light, rail → dark.
    const colors: Array<[number, number, number]> = [];
    for (let i = 0; i < 65; i += 1) colors.push([245, 245, 247]);
    for (let i = 0; i < 35; i += 1) colors.push([20, 18, 40]);
    const data = fakeImageData(colors);
    expect(backdropFromImageData(data, "average")).toBe("light");
    expect(backdropFromImageData(data, "preferDark")).toBe("dark");
  });

  it("preferDark flips to light only when the strip is clearly light", () => {
    const mostlyLight: Array<[number, number, number]> = [];
    for (let i = 0; i < 85; i += 1) mostlyLight.push([245, 245, 247]);
    for (let i = 0; i < 15; i += 1) mostlyLight.push([30, 30, 40]);
    expect(backdropFromImageData(fakeImageData(mostlyLight), "preferDark")).toBe("light");
  });
});
