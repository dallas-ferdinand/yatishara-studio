const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export type LiveSignalKind = "offer" | "answer" | "ice" | "bye";

export type LivePeerRole = "host" | "phone";

type LivePeerOptions = {
  role: LivePeerRole;
  onLocalSignal: (kind: LiveSignalKind, payload: string) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionLost?: () => void;
};

export type LiveReplaySignal = {
  kind: LiveSignalKind;
  from: string;
};

/**
 * Convex keeps every signal for the session. Replaying two offers into one
 * RTCPeerConnection answers the first, then tries to answer again while
 * already `stable`. Keep only the latest remote offer and ICE after it.
 */
export function filterReplaySignals<T extends LiveReplaySignal>(
  rows: T[],
  role: LivePeerRole,
): T[] {
  const remoteFrom = role === "host" ? "phone" : "host";
  const fresh = rows.filter((row) => row.from === remoteFrom);
  let lastOffer = -1;
  for (let i = 0; i < fresh.length; i += 1) {
    if (fresh[i].kind === "offer") lastOffer = i;
  }
  return fresh.filter((row, i) => {
    if (row.kind === "offer") return i === lastOffer;
    if (lastOffer >= 0 && (row.kind === "ice" || row.kind === "bye")) {
      return i > lastOffer;
    }
    return true;
  });
}

function sdpOf(desc: RTCSessionDescription | RTCSessionDescriptionInit | null) {
  return desc?.sdp ?? "";
}

export function createLivePeer(opts: LivePeerOptions) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const pendingIce: RTCIceCandidateInit[] = [];
  let remoteSet = false;
  let chain: Promise<void> = Promise.resolve();
  let closed = false;
  if (opts.role === "host") {
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
  }

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    opts.onLocalSignal("ice", JSON.stringify(event.candidate.toJSON()));
  };
  pc.ontrack = (event) => {
    const stream = event.streams[0] ?? new MediaStream([event.track]);
    opts.onRemoteStream(stream);
  };
  pc.onconnectionstatechange = () => {
    if (closed) return;
    if (pc.connectionState === "failed") opts.onConnectionLost?.();
  };

  function enqueue(work: () => Promise<void>) {
    chain = chain.then(work, work);
    return chain;
  }

  async function flushIce() {
    if (!remoteSet) return;
    while (pendingIce.length) {
      const next = pendingIce.shift();
      if (!next) break;
      try {
        await pc.addIceCandidate(next);
      } catch {
        /* ignore stale ICE */
      }
    }
  }

  async function applyOffer(payload: string) {
    const desc = JSON.parse(payload) as RTCSessionDescriptionInit;
    const incoming = sdpOf(desc);
    const current = sdpOf(pc.currentRemoteDescription ?? pc.remoteDescription);
    if (incoming && current === incoming && pc.signalingState === "stable") {
      return;
    }
    if (pc.signalingState === "closed") return;
    try {
      await pc.setRemoteDescription(desc);
    } catch {
      return;
    }
    remoteSet = true;
    await flushIce();
    if (pc.signalingState !== "have-remote-offer") return;
    const answer = await pc.createAnswer();
    if (pc.signalingState !== "have-remote-offer") return;
    try {
      await pc.setLocalDescription(answer);
    } catch {
      return;
    }
    if (pc.localDescription) {
      opts.onLocalSignal("answer", JSON.stringify(pc.localDescription));
    }
  }

  async function applyAnswer(payload: string) {
    if (pc.signalingState !== "have-local-offer") return;
    const desc = JSON.parse(payload) as RTCSessionDescriptionInit;
    try {
      await pc.setRemoteDescription(desc);
    } catch {
      return;
    }
    remoteSet = true;
    await flushIce();
  }

  async function applyIce(payload: string) {
    let candidate: RTCIceCandidateInit | null = null;
    try {
      candidate = JSON.parse(payload) as RTCIceCandidateInit;
    } catch {
      return;
    }
    if (!remoteSet) {
      pendingIce.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      /* ignore */
    }
  }

  async function applyRemote(kind: LiveSignalKind, payload: string) {
    return enqueue(async () => {
      if (pc.signalingState === "closed") return;
      if (kind === "ice") {
        await applyIce(payload);
        return;
      }
      if (kind === "offer") {
        await applyOffer(payload);
        return;
      }
      if (kind === "answer") {
        await applyAnswer(payload);
      }
    });
  }

  async function sendOffer(stream: MediaStream) {
    return enqueue(async () => {
      if (pc.signalingState === "closed") return;
      for (const track of stream.getTracks()) {
        const already = pc.getSenders().some((row) => row.track === track);
        if (!already) pc.addTrack(track, stream);
      }
      if (pc.signalingState !== "stable") return;
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      opts.onLocalSignal("offer", JSON.stringify(pc.localDescription));
    });
  }

  async function replaceTrack(track: MediaStreamTrack) {
    const sender = pc.getSenders().find((row) => row.track?.kind === track.kind);
    if (sender) {
      await sender.replaceTrack(track);
      return;
    }
    pc.addTrack(track);
  }

  async function replaceVideoTrack(track: MediaStreamTrack) {
    await replaceTrack(track);
  }

  function close() {
    closed = true;
    pc.close();
  }

  return { pc, applyRemote, sendOffer, replaceVideoTrack, replaceTrack, close };
}
