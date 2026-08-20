"use client";

import { useMutation, useQuery } from "convex/react";
import { Flashlight, FlashlightOff, FlipHorizontal, SwitchCamera } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { createLivePeer, filterReplaySignals } from "./livePeer";
import {
  applyTrackTorch,
  applyTrackZoom,
  cameraFromStream,
  cameraSourceName,
  openFacingCamera,
  releaseCamera,
  trackCanTorch,
  type LiveFacing,
} from "./liveCamera";
import { toast } from "sonner";

const DEVICE_KEY = "studio-live-device-key";

function cameraPreviewAspect(
  video: HTMLVideoElement | null,
  stream: MediaStream | null,
) {
  if (video && video.videoWidth > 0 && video.videoHeight > 0) {
    return video.videoWidth / video.videoHeight;
  }
  const settings = stream?.getVideoTracks()[0]?.getSettings();
  const width = settings?.width ?? 0;
  const height = settings?.height ?? 0;
  if (width > 0 && height > 0) return width / height;
  return null;
}

function phoneDeviceKey() {
  try {
    const local = window.localStorage.getItem(DEVICE_KEY);
    if (local) return local;
    const session = window.sessionStorage.getItem(DEVICE_KEY);
    const next =
      session ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `phone_${Date.now()}`);
    window.localStorage.setItem(DEVICE_KEY, next);
    return next;
  } catch {
    return `phone_${Date.now()}`;
  }
}

export function StudioLivePhone() {
  const [deviceKey] = useState(phoneDeviceKey);
  const announceDevice = useMutation(api.liveSessions.announceDevice);
  const setDeviceCamera = useMutation(api.liveSessions.setDeviceCamera);
  const heartbeatDevice = useMutation(api.liveSessions.heartbeatDevice);
  const endDevice = useMutation(api.liveSessions.endDevice);
  const joinAsPhone = useMutation(api.liveSessions.joinAsPhone);
  const postSignal = useMutation(api.liveSessions.postSignal);
  const endMine = useMutation(api.liveSessions.endMine);
  const me = useQuery(api.liveSessions.myDevice, { deviceKey });
  const [preview, setPreview] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [facing, setFacing] = useState<LiveFacing>("environment");
  const [torch, setTorch] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [deviceId, setDeviceId] = useState<Id<"liveDevices"> | null>(null);
  const [sessionId, setSessionId] = useState<Id<"liveSessions"> | null>(null);
  const [peerReady, setPeerReady] = useState(false);
  const [previewAr, setPreviewAr] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<ReturnType<typeof createLivePeer> | null>(null);
  const sessionIdRef = useRef<Id<"liveSessions"> | null>(null);
  const connectedSessionRef = useRef<string | null>(null);
  const facingRef = useRef<LiveFacing>("environment");
  const torchRef = useRef(false);
  const mirrorRef = useRef(false);
  const zoomRef = useRef(1);
  const applyingRef = useRef(false);
  const sharingRef = useRef(false);
  const busyRef = useRef(false);
  const seenSignalsRef = useRef(new Set<string>());
  const signals = useQuery(
    api.liveSessions.listSignals,
    sessionId ? { sessionId } : "skip",
  );

  const syncPreviewRatio = useCallback(() => {
    const aspect = cameraPreviewAspect(videoRef.current, streamRef.current);
    if (aspect) setPreviewAr(aspect);
  }, []);

  const bindVideo = useCallback(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play().catch(() => {});
    syncPreviewRatio();
  }, [syncPreviewRatio]);

  const skipRemoteRef = useRef(0);

  const pushCameraState = useCallback(
    async (nextFacing: LiveFacing, nextTorch: boolean, liveDeviceId?: Id<"liveDevices"> | null) => {
      const info = cameraFromStream(streamRef.current);
      const label = cameraSourceName({
        kind: "phone",
        facing: nextFacing,
      });
      const id = liveDeviceId ?? deviceId;
      if (!id) return;
      try {
        await setDeviceCamera({
          deviceId: id,
          facing: nextFacing,
          torch: nextTorch,
          mirror: mirrorRef.current,
          torchSupported: info.torchSupported || nextFacing === "user",
          cameraLabel: info.label,
          label,
          zoomMin: info.zoom?.min,
          zoomMax: info.zoom?.max,
          zoomSupported: Boolean(info.zoom),
        });
      } catch {
        /* desktop may not have claimed yet */
      }
    },
    [deviceId, setDeviceCamera],
  );

  const startCamera = useCallback(
    async (nextFacing: LiveFacing, nextTorch = false) => {
      const previous = streamRef.current;
      const wantTorch = Boolean(nextTorch);
      if (previous && !wantTorch) {
        await applyTrackTorch(previous.getVideoTracks()[0], false);
      }
      streamRef.current = null;
      await releaseCamera(previous, videoRef.current);
      const stream = await openFacingCamera(nextFacing, true);
      streamRef.current = stream;
      facingRef.current = nextFacing;
      torchRef.current = wantTorch;
      setFacing(nextFacing);
      setTorch(wantTorch);
      const info = cameraFromStream(stream);
      setTorchSupported(Boolean(info.torchSupported) || nextFacing === "user");
      if (wantTorch && info.torchSupported) {
        await applyTrackTorch(stream.getVideoTracks()[0], true);
      }
      if (
        info.zoom &&
        zoomRef.current > (info.zoom.min ?? 1) + 0.05
      ) {
        await applyTrackZoom(stream.getVideoTracks()[0], zoomRef.current);
      }
      bindVideo();
      syncPreviewRatio();
      setPreview(true);
      if (peerRef.current) {
        for (const track of stream.getTracks()) {
          try {
            await peerRef.current.replaceTrack(track);
          } catch {
            /* offer may not be up yet */
          }
        }
      }
      return stream;
    },
    [bindVideo, syncPreviewRatio],
  );

  useEffect(() => {
    if (!signals || !peerRef.current) return;
    const unseen = signals.filter((row) => {
      if (seenSignalsRef.current.has(row._id)) return false;
      seenSignalsRef.current.add(row._id);
      return true;
    });
    const remote = filterReplaySignals(unseen, "phone");
    const peer = peerRef.current;
    void (async () => {
      for (const row of remote) {
        await peer.applyRemote(row.kind, row.payload);
      }
    })();
  }, [peerReady, signals]);

  const stop = useCallback(async () => {
    peerRef.current?.close();
    peerRef.current = null;
    const liveSessionId = sessionIdRef.current;
    const liveDeviceId = deviceId;
    sessionIdRef.current = null;
    connectedSessionRef.current = null;
    setSessionId(null);
    setDeviceId(null);
    seenSignalsRef.current = new Set();
    setPeerReady(false);
    setSharing(false);
    sharingRef.current = false;
    try {
      if (liveSessionId) {
        try {
          await postSignal({
            sessionId: liveSessionId,
            from: "phone",
            kind: "bye",
            payload: "{}",
          });
        } catch {
          /* session may already be gone */
        }
        try {
          await endMine({ sessionId: liveSessionId });
        } catch {
          /* already ended */
        }
      }
      if (liveDeviceId) {
        try {
          await endDevice({ deviceId: liveDeviceId });
        } catch {
          /* already ended */
        }
      }
    } catch {
      /* already ended */
    }
  }, [deviceId, endDevice, endMine, postSignal]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      peerRef.current?.close();
    };
  }, []);

  useEffect(() => {
    bindVideo();
  }, [bindVideo, preview, sharing]);

  useEffect(() => {
    if (!preview) return;
    syncPreviewRatio();
    const video = videoRef.current;
    if (!video) return;
    video.addEventListener("resize", syncPreviewRatio);
    return () => video.removeEventListener("resize", syncPreviewRatio);
  }, [preview, syncPreviewRatio]);

  useEffect(() => {
    if (!preview) return;
    let wake: WakeLockSentinel | null = null;
    void navigator.wakeLock
      ?.request("screen")
      .then((lock) => {
        wake = lock;
      })
      .catch(() => {});
    return () => {
      void wake?.release();
    };
  }, [preview]);

  const reconnectingRef = useRef(false);
  const announceLiveRef = useRef<() => Promise<{
    _id: Id<"liveDevices">;
    sessionId?: Id<"liveSessions">;
  } | null>>(async () => null);
  const connectToComputerRef = useRef<(sessionId: Id<"liveSessions">) => Promise<void>>(
    async () => {},
  );

  const announceLive = useCallback(async () => {
    if (!streamRef.current) return null;
    const info = cameraFromStream(streamRef.current);
    const label = cameraSourceName({
      kind: "phone",
      facing: facingRef.current,
    });
    const device = await announceDevice({
      deviceKey,
      label,
      facing: facingRef.current,
      torch: torchRef.current,
      torchSupported: info.torchSupported || facingRef.current === "user",
      cameraLabel: info.label,
      zoomMin: info.zoom?.min,
      zoomMax: info.zoom?.max,
      zoomSupported: Boolean(info.zoom),
    });
    setDeviceId(device._id);
    if (device.mirror != null) {
      mirrorRef.current = device.mirror;
      setMirror(device.mirror);
    }
    return device;
  }, [announceDevice, deviceKey]);
  announceLiveRef.current = announceLive;

  const connectToComputer = useCallback(
    async (nextSessionId: Id<"liveSessions">) => {
      const stream = streamRef.current;
      if (!stream) return;
      const livePeer = peerRef.current;
      const liveState = livePeer?.pc.connectionState;
      if (
        connectedSessionRef.current === nextSessionId &&
        livePeer &&
        liveState !== "failed" &&
        liveState !== "closed" &&
        liveState !== "disconnected"
      ) {
        return;
      }
      peerRef.current?.close();
      sessionIdRef.current = nextSessionId;
      setSessionId(nextSessionId);
      seenSignalsRef.current = new Set();
      connectedSessionRef.current = nextSessionId;
      try {
        await joinAsPhone({ sessionId: nextSessionId });
      } catch (error) {
        connectedSessionRef.current = null;
        const text = error instanceof Error ? error.message : String(error);
        if (/reconnect|expired|ended|not found/i.test(text)) return;
        throw error;
      }
      const peer = createLivePeer({
        role: "phone",
        onLocalSignal: (kind, payload) => {
          const id = sessionIdRef.current;
          if (!id) return;
          void postSignal({ sessionId: id, from: "phone", kind, payload });
        },
        onRemoteStream: () => {},
        onConnectionLost: () => {
          if (!sharingRef.current || reconnectingRef.current) return;
          reconnectingRef.current = true;
          connectedSessionRef.current = null;
          peerRef.current?.close();
          peerRef.current = null;
          window.setTimeout(() => {
            reconnectingRef.current = false;
            if (!sharingRef.current) return;
            void announceLiveRef.current().then((device) => {
              const next = device?.sessionId ?? sessionIdRef.current;
              if (next) void connectToComputerRef.current(next);
            });
          }, 600);
        },
      });
      peerRef.current = peer;
      setPeerReady(true);
      await peer.sendOffer(stream);
    },
    [joinAsPhone, postSignal],
  );
  connectToComputerRef.current = connectToComputer;

  useEffect(() => {
    if (!sharing || !deviceId) return;
    const tick = () => {
      void heartbeatDevice({ deviceId }).catch(() => {});
      if (me === null) {
        void announceLive()
          .then((device) => {
            if (device?.sessionId) void connectToComputer(device.sessionId);
          })
          .catch(() => {});
      }
    };
    tick();
    const id = window.setInterval(tick, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [
    announceLive,
    connectToComputer,
    deviceId,
    heartbeatDevice,
    me,
    sharing,
  ]);

  useEffect(() => {
    if (!sharing || !me?.sessionId) return;
    void connectToComputer(me.sessionId);
  }, [connectToComputer, me?.sessionId, sharing]);

  useEffect(() => {
    if (!preview || applyingRef.current) return;
    if (Date.now() < skipRemoteRef.current) return;
    const nextFacing = me?.facing;
    const nextTorch = me?.torch;
    if (nextFacing && nextFacing !== facingRef.current) {
      applyingRef.current = true;
      void startCamera(nextFacing, Boolean(nextTorch))
        .then(() => {
          const id = deviceId;
          if (id) return pushCameraState(facingRef.current, torchRef.current, id);
        })
        .catch(() => {})
        .finally(() => {
          applyingRef.current = false;
        });
      return;
    }
    if (nextTorch != null && nextTorch !== torchRef.current) {
      torchRef.current = nextTorch;
      setTorch(nextTorch);
      const track = streamRef.current?.getVideoTracks()[0];
      if (trackCanTorch(track)) {
        void applyTrackTorch(track, nextTorch);
      }
    }
    if (me?.mirror != null && me.mirror !== mirrorRef.current) {
      mirrorRef.current = me.mirror;
      setMirror(me.mirror);
    }
  }, [deviceId, me?.facing, me?.mirror, me?.torch, preview, pushCameraState, startCamera]);

  useEffect(() => {
    if (!preview || me?.zoom == null) return;
    zoomRef.current = me.zoom;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const current = Number((track.getSettings() as { zoom?: number }).zoom);
    if (Number.isFinite(current) && Math.abs(current - me.zoom) < 0.05) return;
    void applyTrackZoom(track, me.zoom);
  }, [me?.zoom, preview]);

  const startShare = useCallback(async () => {
    if (sharingRef.current || busyRef.current) return;
    busyRef.current = true;
    try {
      if (!streamRef.current) await startCamera(facingRef.current, torchRef.current);
      bindVideo();
      const device = await announceLive();
      if (!device) throw new Error("Could not share the camera");
      setSharing(true);
      sharingRef.current = true;
      if (device.sessionId) await connectToComputer(device.sessionId);
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not share the camera"));
    } finally {
      busyRef.current = false;
    }
  }, [announceLive, bindVideo, connectToComputer, startCamera]);

  useEffect(() => {
    void startShare();
    // Open the camera and share as soon as Share camera is on this phone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flip = async () => {
    if (applyingRef.current) return;
    applyingRef.current = true;
    const next: LiveFacing = facingRef.current === "user" ? "environment" : "user";
    try {
      await startCamera(next, torchRef.current);
      if (deviceId) await pushCameraState(next, torchRef.current, deviceId);
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not switch camera"));
    } finally {
      applyingRef.current = false;
    }
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    const next = !torchRef.current;
    if (trackCanTorch(track)) {
      const ok = await applyTrackTorch(track, next);
      if (!ok) {
        toast.error("Flash is not available on this camera");
        return;
      }
    } else if (facingRef.current !== "user") {
      toast.error("Flash is not available on this camera");
      return;
    }
    skipRemoteRef.current = Date.now() + 2000;
    torchRef.current = next;
    setTorch(next);
    if (deviceId) await pushCameraState(facingRef.current, next, deviceId);
  };

  const toggleMirror = async () => {
    const next = !mirrorRef.current;
    skipRemoteRef.current = Date.now() + 2000;
    mirrorRef.current = next;
    setMirror(next);
    if (deviceId) {
      try {
        await setDeviceCamera({ deviceId, mirror: next });
      } catch {
        /* desktop may not have claimed yet */
      }
    }
  };

  const mirrored = mirror;
  const screenFlash = facing === "user" && torch && !trackCanTorch(streamRef.current?.getVideoTracks()[0]);

  return (
    <div className={`studio-live-phone${screenFlash ? " is-screen-flash" : ""}`}>
      <div className="studio-live-phone-stage">
        <div
          className={`studio-live-phone-frame${previewAr ? " is-ready" : ""}`}
          style={
            previewAr
              ? ({ "--phone-ar": String(previewAr) } as CSSProperties)
              : undefined
          }
        >
          <video
            ref={(node) => {
              videoRef.current = node;
              bindVideo();
            }}
            className={`studio-live-phone-video${mirrored ? " is-mirror" : ""}`}
            playsInline
            muted
            autoPlay
            onLoadedMetadata={syncPreviewRatio}
            onLoadedData={syncPreviewRatio}
            onPlaying={syncPreviewRatio}
            onPause={(event) => {
              if (event.currentTarget.srcObject) {
                void event.currentTarget.play().catch(() => {});
              }
            }}
          />
        </div>
      </div>
      <div className="studio-live-phone-bar">
        <button
          type="button"
          className="is-tool"
          aria-label={facing === "user" ? "Use back camera" : "Use front camera"}
          onClick={() => void flip()}
        >
          <SwitchCamera size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`is-tool${mirror ? " is-on" : ""}`}
          aria-label={mirror ? "Same-side output" : "Mirror output"}
          onClick={() => void toggleMirror()}
        >
          <FlipHorizontal size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`is-tool${torch ? " is-on" : ""}`}
          disabled={!torchSupported}
          aria-label={torch ? "Turn flash off" : "Turn flash on"}
          onClick={() => void toggleTorch()}
        >
          {torch ? (
            <Flashlight size={18} aria-hidden="true" />
          ) : (
            <FlashlightOff size={18} aria-hidden="true" />
          )}
        </button>
        {sharing ? (
          <button type="button" className="is-stop" onClick={() => void stop()}>
            Stop
          </button>
        ) : (
          <button type="button" className="is-primary" onClick={() => void startShare()}>
            Share camera
          </button>
        )}
      </div>
    </div>
  );
}
