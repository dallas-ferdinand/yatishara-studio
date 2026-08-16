/**
 * Filmstrip HTML5 seeks fight the WebCodecs preview decoder for bandwidth
 * and GPU. Gate captures while the transport is playing so playback stays smooth.
 */

let playbackBusy = false;
const waiters: Array<() => void> = [];

export function setEditorPlaybackBusy(busy: boolean): void {
  playbackBusy = busy;
  if (!busy) {
    const queued = waiters.splice(0, waiters.length);
    for (const resolve of queued) resolve();
  }
}

export function isEditorPlaybackBusy(): boolean {
  return playbackBusy;
}

/** Resolves when live play is not holding the decoder/network. */
export function whenFilmstripIdle(): Promise<void> {
  if (!playbackBusy) return Promise.resolve();
  return new Promise((resolve) => {
    waiters.push(resolve);
  });
}
