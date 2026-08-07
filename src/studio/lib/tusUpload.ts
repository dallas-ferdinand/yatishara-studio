/**
 * Minimal TUS 1.0 upload for Bunny Stream (no tus-js-client dependency).
 * Chunks the file so large course videos can resume across network blips.
 */

function encodeMetadata(parts: Record<string, string>): string {
  return Object.entries(parts)
    .map(([key, value]) => {
      const bytes = new TextEncoder().encode(value);
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return `${key} ${btoa(binary)}`;
    })
    .join(",");
}

export type TusUploadOptions = {
  file: File;
  endpoint: string;
  headers: Record<string, string>;
  chunkSize?: number;
  onProgress?: (ratio: number) => void;
};

export async function tusUploadFile(opts: TusUploadOptions): Promise<void> {
  const chunkSize = opts.chunkSize ?? 5 * 1024 * 1024;
  const create = await fetch(opts.endpoint, {
    method: "POST",
    headers: {
      ...opts.headers,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(opts.file.size),
      "Upload-Metadata": encodeMetadata({
        filename: opts.file.name || "course.mp4",
        filetype: opts.file.type || "video/mp4",
      }),
    },
  });
  if (!create.ok && create.status !== 201) {
    const text = await create.text().catch(() => "");
    throw new Error(`TUS create failed (${create.status}): ${text.slice(0, 160)}`);
  }
  const location = create.headers.get("Location") || create.headers.get("location");
  if (!location) throw new Error("TUS create did not return Location");

  let offset = 0;
  while (offset < opts.file.size) {
    const end = Math.min(offset + chunkSize, opts.file.size);
    const chunk = opts.file.slice(offset, end);
    const patch = await fetch(location, {
      method: "PATCH",
      headers: {
        ...opts.headers,
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": String(offset),
        "Content-Type": "application/offset+octet-stream",
      },
      body: chunk,
    });
    if (!patch.ok && patch.status !== 204) {
      const text = await patch.text().catch(() => "");
      throw new Error(`TUS patch failed (${patch.status}): ${text.slice(0, 160)}`);
    }
    const next = patch.headers.get("Upload-Offset");
    offset = next ? Number(next) : end;
    if (!Number.isFinite(offset) || offset < end) offset = end;
    opts.onProgress?.(Math.min(1, offset / opts.file.size));
  }
}
