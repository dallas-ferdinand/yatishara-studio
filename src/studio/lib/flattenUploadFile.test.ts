import { describe, expect, it } from "vitest";
import { flattenFileForUpload, stagingContentType } from "./flattenUploadFile";

describe("flattenFileForUpload", () => {
  it("copies compound blobs into one contiguous file", async () => {
    const combined = new File(
      [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])],
      "take.webm",
      { type: "video/webm;codecs=vp8,opus" },
    );
    const flat = await flattenFileForUpload(combined);
    expect(flat).not.toBe(combined);
    expect(flat.size).toBe(5);
    expect(flat.type).toBe("video/webm");
    expect(flat.name).toBe("take.webm");
    expect(new Uint8Array(await flat.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it("strips codec parameters from the upload content type", () => {
    expect(stagingContentType("video/webm;codecs=vp8,opus")).toBe("video/webm");
    expect(stagingContentType("")).toBe("application/octet-stream");
  });
});
