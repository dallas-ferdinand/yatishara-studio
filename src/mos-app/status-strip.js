/** Priority status strip — offline > update > cross-project (one visible band). */

export function refreshStatusStrip() {
  const strip = document.querySelector("#status-strip");
  const offline = document.querySelector("#offline-banner");
  const update = document.querySelector("#update-banner");
  const cross = document.querySelector("#cross-project-banner");

  const offlineOn = offline && !offline.classList.contains("hidden");
  const updateOn = update && !update.classList.contains("hidden");
  const crossOn = cross && !cross.classList.contains("hidden");

  update?.classList.toggle("strip-suppressed", offlineOn);
  cross?.classList.toggle("strip-suppressed", offlineOn || updateOn);

  const show =
    offlineOn ||
    (!offlineOn && updateOn) ||
    (!offlineOn && !updateOn && crossOn);
  strip?.classList.toggle("hidden", !show);
}
