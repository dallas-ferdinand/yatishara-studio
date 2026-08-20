const SHARE_AUDIO: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

const LOOPBACK_RE =
  /\b(monitor of|loopback|stereo mix|what u hear|wave out(?:put)? mix|blackhole|vb-?audio|cable output|soundflower|you hear)\b/i;

type SystemDisplayOpts = DisplayMediaStreamOptions & {
  systemAudio?: "include" | "exclude";
  windowAudio?: "system" | "window" | "exclude";
  monitorTypeSurfaces?: "include" | "exclude";
};

export function isLoopbackAudioLabel(label: string) {
  return LOOPBACK_RE.test(label);
}

export async function openMicCapture() {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
}

async function listAudioInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((row) => row.kind === "audioinput" && row.deviceId);
}

async function openLoopbackCapture() {
  const devices = await listAudioInputs();
  const loopback = devices.find((row) => isLoopbackAudioLabel(row.label));
  if (!loopback) return null;
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: loopback.deviceId },
      ...SHARE_AUDIO,
    },
    video: false,
  });
}

function dropVideoTracks(stream: MediaStream) {
  for (const track of stream.getVideoTracks()) {
    track.stop();
    stream.removeTrack(track);
  }
  return stream;
}

/** Borrow computer sound from an existing screen share so we skip a second picker. */
export function cloneScreenAudio(streams: MediaStream[]) {
  for (const stream of streams) {
    const track = stream
      .getAudioTracks()
      .find((row) => row.readyState === "live");
    if (!track) continue;
    return new MediaStream([track.clone()]);
  }
  return null;
}

async function openDisplayAudio(video: MediaTrackConstraints) {
  const opts: SystemDisplayOpts = {
    video,
    audio: SHARE_AUDIO,
    systemAudio: "include",
    windowAudio: "system",
    monitorTypeSurfaces: "include",
  };
  try {
    return await navigator.mediaDevices.getDisplayMedia(opts);
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") throw error;
    return navigator.mediaDevices.getDisplayMedia({
      video,
      audio: true,
    });
  }
}

function captureUnsupported(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof DOMException &&
      (error.name === "TypeError" || error.name === "NotSupportedError"))
  );
}

export async function openSystemAudioCapture(screenStreams: MediaStream[] = []) {
  const borrowed = cloneScreenAudio(screenStreams);
  if (borrowed?.getAudioTracks().length) return borrowed;

  const loopback = await openLoopbackCapture().catch(() => null);
  if (loopback?.getAudioTracks().length) return loopback;

  try {
    const audioOnly = await navigator.mediaDevices.getDisplayMedia({
      video: false,
      audio: SHARE_AUDIO,
      systemAudio: "include",
    } as SystemDisplayOpts);
    dropVideoTracks(audioOnly);
    if (audioOnly.getAudioTracks().length) return audioOnly;
    audioOnly.getTracks().forEach((track) => track.stop());
    throw new Error("No computer sound. Pick Entire screen and turn Share audio on — we drop the picture.");
  } catch (error) {
    if (!captureUnsupported(error)) throw error;
  }

  const stream = await openDisplayAudio({
    frameRate: 1,
    width: 16,
    height: 16,
  });
  dropVideoTracks(stream);
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("No computer sound. Pick Entire screen and turn Share audio on — we drop the picture.");
  }
  return stream;
}
