export type LiveMixerSessionSnap = {
  mounted: boolean;
  tabActive: boolean;
  recording: boolean;
  saving: boolean;
  savedFlash: boolean;
  elapsedMs: number;
  canStart: boolean;
  previewStream: MediaStream | null;
  previewAr: number;
};

const EMPTY: LiveMixerSessionSnap = {
  mounted: false,
  tabActive: true,
  recording: false,
  saving: false,
  savedFlash: false,
  elapsedMs: 0,
  canStart: false,
  previewStream: null,
  previewAr: 16 / 9,
};

let snap: LiveMixerSessionSnap = EMPTY;
let toggleRec = () => {};
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function publishLiveMixer(partial: Partial<LiveMixerSessionSnap>) {
  snap = { ...snap, ...partial };
  emit();
}

export function setLiveMixerActions(actions: { toggle: () => void }) {
  toggleRec = actions.toggle;
}

export const liveMixerSession = {
  getSnapshot: () => snap,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  toggle: () => toggleRec(),
  openTab: () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("studio-open-live"));
  },
};
