/**
 * Copy a Blob/File into one contiguous File.
 * MediaRecorder parts hang Chrome XHR/fetch if sent as a compound blob —
 * the bar often freezes after the first timeslice (~300–400 KB).
 */
export function stagingContentType(mime: string | undefined | null): string {
  const base = (mime || "").split(";")[0].trim();
  return base || "application/octet-stream";
}

export async function flattenFileForUpload(
  file: Blob,
  name = "upload",
): Promise<File> {
  const buffer = await file.arrayBuffer();
  const fileName = file instanceof File && file.name ? file.name : name;
  const type = stagingContentType(file.type);
  return new File([buffer], fileName, {
    type,
    lastModified: file instanceof File ? file.lastModified : Date.now(),
  });
}
