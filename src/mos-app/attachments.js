/** Attach photo/file from phone to agent message. */
import * as api from "./api.js";

export function wireAttachButton(btn, inputEl, onAttached) {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*,application/pdf,.pdf,.txt,.md";
  fileInput.hidden = true;
  document.body.appendChild(fileInput);

  btn?.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const uploaded = await api.uploadFile(dataUrl, file.name, file.type || "application/octet-stream");
      if (!uploaded.ok) throw new Error(uploaded.error ?? "Upload failed");
      const note = `[Attached from phone: ${uploaded.filename} at ${uploaded.path} (${Math.round(uploaded.size / 1024)}KB)]`;
      onAttached?.({ note, file, uploaded });
    } catch (err) {
      onAttached?.({ error: err.message ?? "Could not attach file" });
    }
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}
