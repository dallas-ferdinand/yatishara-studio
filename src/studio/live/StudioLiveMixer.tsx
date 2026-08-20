"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  AudioLines,
  Camera,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Loader2,
  Mic,
  Monitor,
  MonitorOff,
  Palette,
  Plus,
  Smartphone,
  Undo2,
  Redo2,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { friendlyConvexError } from "@/studio/lib/convexUserErrors";
import { DM_LABEL_ICON_OPTIONS, dmLabelIcon } from "@/studio/lib/dmLabelIcons";
import { uploadStudioAsset } from "@/studio/lib/uploadAsset";
import { paintLiveFrame } from "./liveCompositor";
import { openMicCapture, openSystemAudioCapture } from "./liveAudio";
import { applyTrackTorch, applyTrackZoom, trackCanTorch, trackZoomRange } from "./liveCamera";
import {
  forgetDevicePreset,
  loadMixerState,
  loadPresetForSource,
  persistSourcePreset,
  saveMixerState,
} from "./liveMixerStorage";
import {
  LIVE_DIGITAL_ZOOM_MAX,
  activeSources,
  addScene,
  addSourceToMixer,
  applyHandle,
  canvasAspectForState,
  cursorForHandle,
  displayedSourceIds,
  emptyMixerState,
  hitMixerSource,
  hitRectHandle,
  isAudioOnlyKind,
  liveCanvasSize,
  liveRectCanvasGaps,
  liveRectRatioKind,
  lockRectToAspect,
  maskNormalizedAspect,
  mediaAspectFromSize,
  nearLiveEdgeSides,
  nudgeLiveRect,
  patchScene,
  patchSource,
  removeScene,
  removeSourceFromMixer,
  reorderDisplayedSources,
  resolveLiveSource,
  resolvedMaskRect,
  sceneFrameRatio,
  sceneIconKey,
  snapLiveRect,
  sourceHasMask,
  sourceRectMatchesMedia,
  videoNormalizedAspect,
  LIVE_NUDGE_PX,
  LIVE_NUDGE_SHIFT_PX,
  type LiveEdgeSide,
  type LiveFocus,
  type LiveHandle,
  type LiveMixerState,
  type LiveRect,
  type LiveSnapGuides,
} from "./liveMixerModel";
import { createLivePeer, filterReplaySignals } from "./livePeer";
import { StudioLiveAudioMixer } from "./StudioLiveAudioMixer";
import { StudioLiveInspector } from "./StudioLiveInspector";
import { StudioLivePhone } from "./StudioLivePhone";
import "./studio-live.css";

const SCREEN_SHARE_VIDEO_BPS = 2_800_000;

async function openLiveCapture(kind: "camera" | "screen") {
  const shareAudio = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (kind === "camera") {
    return navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: true,
      })
      .catch(() =>
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        }),
      );
  }
  return navigator.mediaDevices
    .getDisplayMedia({
      video: true,
      audio: shareAudio,
    })
    .catch(() =>
      navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      }),
    );
}


function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
    "video/mp4",
  ].find((type) => MediaRecorder.isTypeSupported(type));
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function LiveConfirmTrash({
  armed,
  label,
  onArm,
  onConfirm,
}: {
  armed: boolean;
  label: string;
  onArm: () => void;
  onConfirm: () => void;
}) {
  return (
    <button
      type="button"
      data-live-confirm-trash=""
      className={`studio-live-icon-btn${armed ? " is-confirm" : ""}`}
      aria-label={armed ? `Confirm ${label}` : label}
      title={armed ? "Confirm" : label}
      onClick={(event) => {
        event.stopPropagation();
        if (armed) onConfirm();
        else onArm();
      }}
    >
      {armed ? <Check size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
    </button>
  );
}

function LiveRenameInput({
  initialName,
  onCommit,
  onDismiss,
}: {
  initialName: string;
  onCommit: (name: string) => void;
  onDismiss: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(initialName);
  const finishedRef = useRef(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const finish = (mode: "commit" | "dismiss") => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (mode === "commit") onCommit(value);
    else onDismiss();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className="studio-live-rename-input"
      value={value}
      maxLength={48}
      aria-label="Name"
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          finish("commit");
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish("dismiss");
        }
      }}
      onBlur={() => finish("commit")}
    />
  );
}

function LiveRowName({
  name,
  renaming,
  onSelect,
  onStartRename,
  onCommit,
  onDismiss,
}: {
  name: string;
  renaming: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onCommit: (name: string) => void;
  onDismiss: () => void;
}) {
  if (renaming) {
    return (
      <LiveRenameInput
        initialName={name}
        onCommit={(next) => {
          const trimmed = next.trim().slice(0, 48);
          if (trimmed && trimmed !== name) onCommit(trimmed);
          onDismiss();
        }}
        onDismiss={onDismiss}
      />
    );
  }
  return (
    <button
      type="button"
      className="studio-live-row-name is-renameable"
      title="Double-click to rename"
      onClick={onSelect}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onStartRename();
      }}
    >
      {name}
    </button>
  );
}

function canvasPoint(
  frame: HTMLElement,
  clientX: number,
  clientY: number,
  canvasW: number,
  canvasH: number,
) {
  const box = frame.getBoundingClientRect();
  const aspect = canvasW / canvasH;
  let w = box.width;
  let h = w / aspect;
  if (h > box.height) {
    h = box.height;
    w = h * aspect;
  }
  const left = box.left + (box.width - w) / 2;
  const top = box.top + (box.height - h) / 2;
  return {
    x: ((clientX - left) / w) * canvasW,
    y: ((clientY - top) / h) * canvasH,
    left,
    top,
    w,
    h,
  };
}

function overlayBoxStyle(
  rect: LiveRect,
  radius = 0,
  previewW: number,
  previewH: number,
): CSSProperties {
  const r = radius * Math.min(rect.w * previewW, rect.h * previewH);
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`,
    borderRadius: `${r}px`,
  };
}

function isLiveNudgeBlocked(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest(
      '[role="slider"], [role="listbox"], [role="menu"], .cursor-select-menu',
    ),
  );
}

function LiveEdgeGap({
  side,
  rect,
  px,
}: {
  side: LiveEdgeSide;
  rect: LiveRect;
  px: number;
}) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const style: CSSProperties =
    side === "left"
      ? { left: 0, width: `${rect.x * 100}%`, top: `${cy * 100}%` }
      : side === "right"
        ? {
            left: `${(rect.x + rect.w) * 100}%`,
            width: `${Math.max(0, 1 - rect.x - rect.w) * 100}%`,
            top: `${cy * 100}%`,
          }
        : side === "top"
          ? { top: 0, height: `${rect.y * 100}%`, left: `${cx * 100}%` }
          : {
              top: `${(rect.y + rect.h) * 100}%`,
              height: `${Math.max(0, 1 - rect.y - rect.h) * 100}%`,
              left: `${cx * 100}%`,
            };
  return (
    <div className={`studio-live-gap is-${side}`} style={style}>
      <span className="studio-live-gap-label">{px}</span>
    </div>
  );
}

export function StudioLiveMixer() {
  const { isMobile } = useMobileLayout();
  if (isMobile) return <StudioLivePhone />;
  return <LiveDesktopMixer />;
}

function LivePhoneBridge({
  sessionId,
  sourceId,
  bindStream,
  dropStream,
  onEnded,
  onRestart,
}: {
  sessionId: Id<"liveSessions">;
  sourceId: string;
  bindStream: (sourceId: string, stream: MediaStream) => void;
  dropStream: (sourceId: string, stream?: MediaStream, stopTracks?: boolean) => void;
  onEnded: () => void;
  onRestart: () => void;
}) {
  const signals = useQuery(api.liveSessions.listSignals, { sessionId });
  const postSignal = useMutation(api.liveSessions.postSignal);
  const markLive = useMutation(api.liveSessions.markLive);
  const heartbeat = useMutation(api.liveSessions.heartbeat);
  const peerRef = useRef<ReturnType<typeof createLivePeer> | null>(null);
  const seenSignalsRef = useRef(new Set<string>());
  const mountedAtRef = useRef(Date.now());
  const bindStreamRef = useRef(bindStream);
  const dropStreamRef = useRef(dropStream);
  const postSignalRef = useRef(postSignal);
  const markLiveRef = useRef(markLive);
  const onRestartRef = useRef(onRestart);
  bindStreamRef.current = bindStream;
  dropStreamRef.current = dropStream;
  postSignalRef.current = postSignal;
  markLiveRef.current = markLive;
  onRestartRef.current = onRestart;
  const [peerGen, setPeerGen] = useState(0);

  useEffect(() => {
    seenSignalsRef.current = new Set();
    mountedAtRef.current = Date.now();
    const peer = createLivePeer({
      role: "host",
      onLocalSignal: (kind, payload) => {
        void postSignalRef.current({
          sessionId,
          from: "host",
          kind,
          payload,
        });
      },
      onRemoteStream: (stream) => {
        bindStreamRef.current(sourceId, stream);
        void markLiveRef.current({ sessionId });
      },
      onConnectionLost: () => {
        dropStreamRef.current(sourceId, undefined, false);
        onRestartRef.current();
      },
    });
    peerRef.current = peer;
    setPeerGen((n) => n + 1);
    return () => {
      peer.close();
      peerRef.current = null;
      dropStreamRef.current(sourceId, undefined, false);
    };
  }, [sessionId, sourceId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void heartbeat({ sessionId });
    }, 20_000);
    return () => window.clearInterval(id);
  }, [heartbeat, sessionId]);

  useEffect(() => {
    if (!peerGen || !signals || !peerRef.current) return;
    const unseen = signals.filter((row) => {
      if (seenSignalsRef.current.has(row._id)) return false;
      seenSignalsRef.current.add(row._id);
      return true;
    });
    const fresh = unseen.filter((row) => {
      if (row.kind === "bye" || row.kind === "offer") {
        return row.createdAt + 250 >= mountedAtRef.current;
      }
      return true;
    });
    const remote = filterReplaySignals(fresh, "host");
    const peer = peerRef.current;
    void (async () => {
      for (const row of remote) {
        if (row.kind === "bye") {
          onEnded();
          continue;
        }
        await peer.applyRemote(row.kind, row.payload);
      }
    })();
  }, [onEnded, peerGen, signals]);

  return null;
}

function LiveDesktopMixer() {
  const [mixer, setMixer] = useState<LiveMixerState>(
    () => loadMixerState() ?? emptyMixerState(),
  );
  const [addOpen, setAddOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    kind: "scene" | "source";
    id: string;
  } | null>(null);
  const [renaming, setRenaming] = useState<{
    kind: "scene" | "source";
    id: string;
  } | null>(null);
  const [iconPickerSceneId, setIconPickerSceneId] = useState<string | null>(null);
  const [iconPickerPos, setIconPickerPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [recording, setRecording] = useState(false);
  const [snapGuides, setSnapGuides] = useState<LiveSnapGuides>({ x: null, y: null });
  const [maskReveal, setMaskReveal] = useState(false);
  const [gapFlash, setGapFlash] = useState(false);
  const [recordLayout, setRecordLayout] = useState<ReturnType<typeof liveCanvasSize> | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [dismissedDeviceIds, setDismissedDeviceIds] = useState<string[]>([]);
  const [draggingLayer, setDraggingLayer] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const videosRef = useRef(new Map<string, HTMLVideoElement>());
  const lastPaintRef = useRef(new Map<string, HTMLVideoElement>());
  const mixerRef = useRef(mixer);
  mixerRef.current = mixer;
  const historyRef = useRef<{ past: LiveMixerState[]; future: LiveMixerState[] }>({
    past: [],
    future: [],
  });
  const historyCoalesceRef = useRef(0);
  const dragDidRecordRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncHistoryButtons = useCallback(() => {
    setCanUndo(historyRef.current.past.length > 0);
    setCanRedo(historyRef.current.future.length > 0);
  }, []);

  const recordHistory = useCallback(
    (state: LiveMixerState) => {
      historyRef.current.past.push(structuredClone(state));
      if (historyRef.current.past.length > 80) historyRef.current.past.shift();
      historyRef.current.future = [];
      syncHistoryButtons();
    },
    [syncHistoryButtons],
  );

  const editMixer = useCallback(
    (
      updater: (state: LiveMixerState) => LiveMixerState,
      mode: "once" | "coalesce" = "once",
    ) => {
      setMixer((state) => {
        const next = updater(state);
        if (next === state) return state;
        const now = performance.now();
        if (mode === "once" || now - historyCoalesceRef.current > 450) {
          historyRef.current.past.push(structuredClone(state));
          if (historyRef.current.past.length > 80) historyRef.current.past.shift();
          historyRef.current.future = [];
        }
        historyCoalesceRef.current = now;
        queueMicrotask(syncHistoryButtons);
        return next;
      });
    },
    [syncHistoryButtons],
  );

  const undoMixer = useCallback(() => {
    const prev = historyRef.current.past.pop();
    if (!prev) return;
    historyRef.current.future.push(structuredClone(mixerRef.current));
    setMixer(prev);
    syncHistoryButtons();
  }, [syncHistoryButtons]);

  const redoMixer = useCallback(() => {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(structuredClone(mixerRef.current));
    setMixer(next);
    syncHistoryButtons();
  }, [syncHistoryButtons]);
  const maskRevealRef = useRef(maskReveal);
  maskRevealRef.current = maskReveal;
  const gapFlashTimerRef = useRef(0);

  useEffect(() => {
    const id = window.setTimeout(() => saveMixerState(mixerRef.current), 400);
    return () => window.clearTimeout(id);
  }, [mixer]);
  const recordLayoutRef = useRef(recordLayout);
  recordLayoutRef.current = recordLayout;
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const streamsRef = useRef(new Map<string, MediaStream>());
  const claimingRef = useRef(new Set<string>());
  const lastClaimAtRef = useRef(new Map<string, number>());
  const layerDragRef = useRef<{ id: string } | null>(null);
  const dragRef = useRef<{
    sourceId: string;
    handle: LiveHandle;
    lastX: number;
    lastY: number;
    target: LiveFocus;
  } | null>(null);
  const pendingDragRef = useRef<{
    sourceId: string;
    handle: LiveHandle;
    lastX: number;
    lastY: number;
    target: LiveFocus;
    pointerId: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartedAt = useRef(0);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const iconPickerRef = useRef<HTMLDivElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioTapsRef = useRef(
    new Map<string, { analyser: AnalyserNode; gain: GainNode; audioKey: string }>(),
  );
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mixMonitorRef = useRef<HTMLAudioElement | null>(null);
  const keepAwakeRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [addMenuPos, setAddMenuPos] = useState<{
    top: number | "auto";
    bottom: number | "auto";
    right: number;
  } | null>(null);

  const devices = useQuery(api.liveSessions.listDevices, {});
  const claimDevice = useMutation(api.liveSessions.claimDevice);
  const setDeviceCamera = useMutation(api.liveSessions.setDeviceCamera);
  const endMine = useMutation(api.liveSessions.endMine);
  const ensureScreenRecordings = useMutation(
    api.folders.ensureScreenRecordingsFolderForMe,
  );
  const reserveUpload = useMutation(api.assets.reserveUpload);
  const commitStagingUpload = useAction(api.assetActions.commitStagingUpload);

  const sceneSources = useMemo(() => activeSources(mixer), [mixer]);
  const activeScene = mixer.scenes.find((row) => row.id === mixer.activeSceneId) ?? mixer.scenes[0] ?? null;
  const canvasSize = recordLayout ?? liveCanvasSize(sceneFrameRatio(activeScene));
  const layerSources = useMemo(() => {
    return displayedSourceIds(mixer)
      .map((id) => mixer.sources.find((row) => row.id === id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [mixer]);
  const selected = mixer.sources.find((row) => row.id === mixer.selectedSourceId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key;
      if (mod && key.toLowerCase() === "z" && !event.shiftKey) {
        if (isLiveNudgeBlocked(event.target)) return;
        event.preventDefault();
        undoMixer();
        return;
      }
      if (
        mod &&
        ((key.toLowerCase() === "z" && event.shiftKey) || key.toLowerCase() === "y")
      ) {
        if (isLiveNudgeBlocked(event.target)) return;
        event.preventDefault();
        redoMixer();
        return;
      }
      if (isLiveNudgeBlocked(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (
        key !== "ArrowLeft" &&
        key !== "ArrowRight" &&
        key !== "ArrowUp" &&
        key !== "ArrowDown"
      ) {
        return;
      }
      const current = mixerRef.current;
      const source = current.sources.find((row) => row.id === current.selectedSourceId);
      if (!source || isAudioOnlyKind(source.kind)) return;
      event.preventDefault();
      const frame = frameRef.current;
      const previewW = Math.max(1, frame?.clientWidth || canvasSize.w);
      const previewH = Math.max(1, frame?.clientHeight || canvasSize.h);
      const stepPx = event.shiftKey ? LIVE_NUDGE_SHIFT_PX : LIVE_NUDGE_PX;
      const dx =
        key === "ArrowLeft" ? -stepPx / previewW : key === "ArrowRight" ? stepPx / previewW : 0;
      const dy =
        key === "ArrowUp" ? -stepPx / previewH : key === "ArrowDown" ? stepPx / previewH : 0;
      const canvasAspect = canvasSize.ar;
      const revealing =
        maskRevealRef.current &&
        (current.selectedFocus ?? "video") === "mask" &&
        sourceHasMask(source);
      editMixer((state) => {
        const row = state.sources.find((item) => item.id === source.id);
        if (!row) return state;
        if (revealing) {
          const mask = resolvedMaskRect(row, canvasAspect);
          if (!mask) return state;
          return patchSource(state, row.id, { maskRect: nudgeLiveRect(mask, dx, dy) });
        }
        return patchSource(state, row.id, { rect: nudgeLiveRect(row.rect, dx, dy) });
      }, "coalesce");
      setGapFlash(true);
      window.clearTimeout(gapFlashTimerRef.current);
      gapFlashTimerRef.current = window.setTimeout(() => setGapFlash(false), 900);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(gapFlashTimerRef.current);
    };
  }, [canvasSize.ar, canvasSize.h, canvasSize.w, editMixer, redoMixer, undoMixer]);
  const attachedDeviceIds = useMemo(
    () =>
      new Set(
        mixer.sources
          .map((row) => row.deviceId)
          .filter((id): id is string => Boolean(id)),
      ),
    [mixer.sources],
  );
  const onlinePhones = (devices ?? []).filter(
    (device) => !attachedDeviceIds.has(device._id),
  );

  const bindStream = useCallback((sourceId: string, stream: MediaStream) => {
    const held = streamsRef.current.get(sourceId);
    let live = stream;
    if (held && held !== stream) {
      for (const track of stream.getTracks()) {
        if (!held.getTracks().some((row) => row.id === track.id)) {
          try {
            held.addTrack(track);
          } catch {
            /* already on another stream */
          }
        }
      }
      live = held;
    }
    streamsRef.current.set(sourceId, live);
    const video = videosRef.current.get(sourceId);
    if (video) {
      if (video.srcObject !== live) video.srcObject = live;
      void video.play().catch(() => {});
    }
    const tracks = live.getAudioTracks().filter((track) => track.readyState !== "ended");
    const audioKey = tracks.map((track) => track.id).join(",");
    const prevTap = audioTapsRef.current.get(sourceId);
    if (prevTap && prevTap.audioKey === audioKey) return;
    if (!tracks.length) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = audioCtxRef.current ?? new AudioCtx();
    audioCtxRef.current = ctx;
    void ctx.resume().catch(() => {});
    try {
      prevTap?.gain.disconnect();
    } catch {
      /* already gone */
    }
    const node = ctx.createMediaStreamSource(new MediaStream(tracks));
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.45;
    const source = mixerRef.current.sources.find((row) => row.id === sourceId);
    gain.gain.value =
      !source || source.muted || !source.visible ? 0 : (source.volume ?? 1);
    if (!mixDestRef.current) mixDestRef.current = ctx.createMediaStreamDestination();
    node.connect(analyser);
    analyser.connect(gain);
    gain.connect(mixDestRef.current);
    if (!mixMonitorRef.current) {
      const monitor = new Audio();
      monitor.muted = true;
      monitor.playsInline = true;
      monitor.srcObject = mixDestRef.current.stream;
      void monitor.play().catch(() => {});
      mixMonitorRef.current = monitor;
    }
    audioTapsRef.current.set(sourceId, { analyser, gain, audioKey });
  }, []);

  const dropStream = useCallback((sourceId: string, stream?: MediaStream, stopTracks = true) => {
    const held = streamsRef.current.get(sourceId);
    if (stream && held && held !== stream) return;
    const toStop = stream ?? held;
    if (stopTracks) {
      toStop?.getTracks().forEach((track) => track.stop());
    }
    if (!stopTracks) return;
    if (!stream || held === stream || !held) streamsRef.current.delete(sourceId);
    lastPaintRef.current.delete(sourceId);
    const video = videosRef.current.get(sourceId);
    if (video && (!stream || video.srcObject === stream)) video.srcObject = null;
    const tap = audioTapsRef.current.get(sourceId);
    try {
      tap?.gain.disconnect();
    } catch {
      /* already gone */
    }
    audioTapsRef.current.delete(sourceId);
  }, []);

  const stopCapture = useCallback(
    (sourceId: string) => {
      dropStream(sourceId);
      setMixer((current) => {
        const row = current.sources.find((item) => item.id === sourceId);
        if (!row || row.offline) return current;
        return patchSource(current, sourceId, { offline: true });
      });
    },
    [dropStream],
  );

  const attachCapture = useCallback(
    (sourceId: string, stream: MediaStream) => {
      const previous = streamsRef.current.get(sourceId);
      if (previous && previous !== stream) dropStream(sourceId, previous, true);
      bindStream(sourceId, stream);
      const markOffline = () => {
        dropStream(sourceId, stream);
        setMixer((current) => {
          const live = streamsRef.current.get(sourceId);
          if (live && live !== stream) return current;
          const row = current.sources.find((item) => item.id === sourceId);
          if (!row) return current;
          if (row.kind === "camera" && row.remembered === false) {
            return removeSourceFromMixer(current, sourceId);
          }
          return patchSource(current, sourceId, { offline: true });
        });
      };
      for (const track of stream.getTracks()) {
        track.addEventListener("ended", markOffline);
      }
      stream.addEventListener("addtrack", () => bindStream(sourceId, stream));
    },
    [bindStream, dropStream],
  );

  const reconnectCapture = useCallback(
    async (sourceId: string) => {
      const row = mixerRef.current.sources.find((item) => item.id === sourceId);
      if (!row) return;
      if (row.kind !== "camera" && row.kind !== "screen" && !isAudioOnlyKind(row.kind)) {
        return;
      }
      try {
        const stream =
          row.kind === "mic"
            ? await openMicCapture()
            : row.kind === "system"
              ? await openSystemAudioCapture(
                  mixerRef.current.sources
                    .filter((item) => item.kind === "screen")
                    .map((item) => streamsRef.current.get(item.id))
                    .filter((item): item is MediaStream => Boolean(item)),
                )
              : await openLiveCapture(row.kind);
        const track = stream.getVideoTracks()[0];
        const zoomRange = track ? trackZoomRange(track) : null;
        attachCapture(sourceId, stream);
        if (zoomRange && row.zoom != null) {
          void applyTrackZoom(track, row.zoom);
        }
        setMixer((state) =>
          patchSource(state, sourceId, {
            offline: false,
            ...(row.kind === "camera"
              ? {
                  cameraDeviceId: track?.getSettings?.().deviceId ?? row.cameraDeviceId,
                  zoomMin: zoomRange?.min ?? row.zoomMin,
                  zoomMax: zoomRange?.max ?? row.zoomMax,
                  zoomHardware: Boolean(zoomRange),
                }
              : {}),
          }),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "NotAllowedError") return;
        toast.error(
          friendlyConvexError(
            error,
            row.kind === "mic"
              ? "Could not add the microphone"
              : row.kind === "system"
                ? "Could not capture system audio"
                : row.kind === "screen"
                  ? "Could not share the screen"
                  : "Could not reconnect the camera",
          ),
        );
      }
    },
    [attachCapture],
  );

  const claimPhone = useCallback(
    async (
      deviceId: Id<"liveDevices">,
      label: string,
      deviceKey?: string,
      restart = false,
      quiet = false,
    ) => {
      try {
        const prior = mixerRef.current.sources.find(
          (row) =>
            row.deviceId === deviceId ||
            (deviceKey && row.deviceKey === deviceKey),
        );
        const preset = prior
          ? null
          : loadPresetForSource({
              kind: "phone",
              deviceId,
              deviceKey,
            });
        const session = await claimDevice({ deviceId, restart });
        if (!session) {
          if (prior) {
            setMixer((state) =>
              patchSource(state, prior.id, { offline: true, sessionId: undefined }),
            );
          }
          if (!quiet) {
            toast.error("That phone went offline. Share camera on the phone again.");
          }
          return false;
        }
        editMixer((state) => {
          const existing = state.sources.find(
            (row) =>
              row.deviceId === deviceId ||
              (deviceKey && row.deviceKey === deviceKey),
          );
          if (existing) {
            return patchSource(state, existing.id, {
              deviceId,
              deviceKey: deviceKey ?? existing.deviceKey,
              sessionId: session._id,
              name: existing.name || label || "Phone",
              offline: false,
              remembered: existing.remembered !== false,
            });
          }
          const saved = preset ?? {};
          return addSourceToMixer(state, {
            kind: "phone",
            ...saved,
            name: saved.name || label || "Phone",
            deviceId,
            deviceKey,
            sessionId: session._id,
            remembered: saved.remembered !== false,
            offline: false,
          });
        });
        const facing = prior?.facing ?? preset?.facing;
        const torch = prior?.torch ?? preset?.torch;
        const mirror = prior?.mirror ?? preset?.mirror;
        const zoom =
          (prior?.zoomHardware || preset?.zoomHardware) &&
          Number.isFinite(prior?.zoom ?? preset?.zoom)
            ? (prior?.zoom ?? preset?.zoom)
            : undefined;
        if (facing || torch != null || mirror != null || zoom != null) {
          void setDeviceCamera({
            deviceId,
            ...(facing ? { facing } : {}),
            ...(torch != null ? { torch } : {}),
            ...(mirror != null ? { mirror } : {}),
            ...(zoom != null ? { zoom } : {}),
          });
        }
        return true;
      } catch (error) {
        if (!quiet) toast.error(friendlyConvexError(error, "Could not add that phone"));
        return false;
      }
    },
    [claimDevice, setDeviceCamera, editMixer],
  );

  useEffect(() => {
    if (!devices) return;
    for (const device of devices) {
      if (dismissedDeviceIds.includes(device._id)) continue;
      const existing = mixerRef.current.sources.find(
        (row) => row.deviceId === device._id || row.deviceKey === device.deviceKey,
      );
      const liveTrack = existing
        ? streamsRef.current
            .get(existing.id)
            ?.getVideoTracks()
            .some((track) => track.readyState === "live")
        : false;
      if (liveTrack) continue;
      const last = lastClaimAtRef.current.get(device._id) ?? 0;
      if (Date.now() - last < 1500) continue;
      if (claimingRef.current.has(device._id)) continue;
      claimingRef.current.add(device._id);
      lastClaimAtRef.current.set(device._id, Date.now());
      void claimPhone(
        device._id,
        device.label,
        device.deviceKey,
        Boolean(existing),
        true,
      ).finally(() => {
        claimingRef.current.delete(device._id);
      });
    }
  }, [claimPhone, devices, dismissedDeviceIds]);

  useEffect(() => {
    if (!devices) return;
    setMixer((state) => {
      let next = state;
      for (const device of devices) {
        const row = next.sources.find(
          (source) =>
            source.deviceId === device._id || source.deviceKey === device.deviceKey,
        );
        if (!row) continue;
        const zoomHardware = Boolean(device.zoomSupported);
        if (
          row.zoomHardware === zoomHardware &&
          row.zoomMin === device.zoomMin &&
          row.zoomMax === device.zoomMax &&
          row.cameraLabel === (device.cameraLabel ?? row.cameraLabel) &&
          row.facing === (device.facing ?? row.facing) &&
          Boolean(row.torch) === Boolean(device.torch) &&
          Boolean(row.mirror) === Boolean(device.mirror ?? row.mirror)
        ) {
          continue;
        }
        const facing = device.facing ?? row.facing;
        next = patchSource(next, row.id, {
          zoomHardware,
          zoomMin: device.zoomMin,
          zoomMax: device.zoomMax,
          cameraLabel: device.cameraLabel ?? row.cameraLabel,
          facing,
          torch: Boolean(device.torch),
          mirror: device.mirror ?? row.mirror,
        });
      }
      return next;
    });
  }, [devices]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const tick = () => {
      const size =
        recordLayoutRef.current ??
        liveCanvasSize(
          sceneFrameRatio(
            mixerRef.current.scenes.find(
              (row) => row.id === mixerRef.current.activeSceneId,
            ),
          ),
        );
      if (canvas.width !== size.w) canvas.width = size.w;
      if (canvas.height !== size.h) canvas.height = size.h;
      const inputs = new Map();
      const pendingAspects: { id: string; aspect: number }[] = [];
      for (const [id, video] of videosRef.current) {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          lastPaintRef.current.set(id, video);
          inputs.set(id, { video });
        } else {
          const last = lastPaintRef.current.get(id);
          if (last) inputs.set(id, { video: last });
        }
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          const row = mixerRef.current.sources.find((source) => source.id === id);
          if (row) {
            const aspect = mediaAspectFromSize(
              row.kind,
              video.videoWidth,
              video.videoHeight,
            );
            if (
              Math.abs((row.mediaAspect ?? 0) - aspect) > 0.04 ||
              !sourceRectMatchesMedia(row.rect, aspect, size.ar)
            ) {
              pendingAspects.push({ id, aspect });
            }
          }
        }
      }
      for (const [id, image] of imagesRef.current) {
        if (image.complete && image.naturalWidth > 0) {
          const prev = inputs.get(id) ?? {};
          inputs.set(id, { ...prev, image });
          const row = mixerRef.current.sources.find((source) => source.id === id);
          if (row) {
            const aspect = mediaAspectFromSize(
              row.kind,
              image.naturalWidth,
              image.naturalHeight,
            );
            if (
              Math.abs((row.mediaAspect ?? 0) - aspect) > 0.04 ||
              !sourceRectMatchesMedia(row.rect, aspect, size.ar)
            ) {
              pendingAspects.push({ id, aspect });
            }
          }
        }
      }
      if (pendingAspects.length) {
        setMixer((state) => {
          let next = state;
          for (const item of pendingAspects) {
            const row = next.sources.find((source) => source.id === item.id);
            if (!row) continue;
            if (
              Math.abs((row.mediaAspect ?? 0) - item.aspect) <= 0.04 &&
              sourceRectMatchesMedia(
                row.rect,
                item.aspect,
                canvasAspectForState(next),
              )
            ) {
              continue;
            }
            next = patchSource(next, item.id, { mediaAspect: item.aspect });
          }
          return next;
        });
      }
      paintLiveFrame(
        ctx,
        activeSources(mixerRef.current),
        inputs,
        size.w,
        size.h,
        {
          mixer: mixerRef.current,
          revealSourceId:
            !recordingRef.current &&
            maskRevealRef.current &&
            (mixerRef.current.selectedFocus ?? "video") === "mask"
              ? mixerRef.current.selectedSourceId
              : null,
        },
      );
    };
    let raf = 0;
    let interval = 0;
    const loop = () => {
      tick();
      raf = window.requestAnimationFrame(loop);
    };
    const useTimer = () => {
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
      if (!interval) interval = window.setInterval(tick, 33);
    };
    const useRaf = () => {
      if (interval) {
        window.clearInterval(interval);
        interval = 0;
      }
      if (!raf) raf = window.requestAnimationFrame(loop);
    };
    const onVis = () => {
      void audioCtxRef.current?.resume().catch(() => {});
      if (mixMonitorRef.current) void mixMonitorRef.current.play().catch(() => {});
      for (const video of videosRef.current.values()) {
        void video.play().catch(() => {});
      }
      if (document.hidden) useTimer();
      else useRaf();
    };
    document.addEventListener("visibilitychange", onVis);
    onVis();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.cancelAnimationFrame(raf);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - recordStartedAt.current);
    }, 250);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => {
    if (!addOpen) {
      setAddMenuPos(null);
      return;
    }
    const place = () => {
      const btn = addBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openDown = spaceBelow >= 220;
      setAddMenuPos({
        top: openDown ? rect.bottom + 4 : "auto",
        bottom: openDown ? "auto" : window.innerHeight - rect.top + 4,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    place();
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (addBtnRef.current?.contains(target)) return;
      if (addMenuRef.current?.contains(target)) return;
      setAddOpen(false);
    };
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [addOpen]);

  useEffect(() => {
    if (!iconPickerSceneId && !pendingDelete) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (iconPickerRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[data-live-scene-icon], [data-live-confirm-trash]")
      ) {
        return;
      }
      setIconPickerSceneId(null);
      setPendingDelete(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIconPickerSceneId(null);
      setPendingDelete(null);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [iconPickerSceneId, pendingDelete]);

  useEffect(() => {
    return () => {
      for (const stream of streamsRef.current.values()) {
        stream.getTracks().forEach((track) => track.stop());
      }
      recorderRef.current?.stop();
      try {
        keepAwakeRef.current?.osc.stop();
      } catch {
        /* already stopped */
      }
      keepAwakeRef.current = null;
      mixMonitorRef.current?.pause();
      mixMonitorRef.current = null;
      void wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      void audioCtxRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const data = new Uint8Array(1024);
    let raf = 0;
    let interval = 0;
    let last = 0;
    const sample = (now: number) => {
      if (now - last < 60) return;
      last = now;
      void audioCtxRef.current?.resume().catch(() => {});
      const next: Record<string, number> = {};
      for (const [id, tap] of audioTapsRef.current) {
        tap.analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i += 1) {
          peak = Math.max(peak, Math.abs((data[i] ?? 128) - 128) / 128);
        }
        next[id] = Math.min(1, peak * 3.2);
      }
      setLevels(next);
    };
    const loop = (now: number) => {
      sample(now);
      raf = window.requestAnimationFrame(loop);
    };
    const onVis = () => {
      if (document.hidden) {
        if (raf) {
          window.cancelAnimationFrame(raf);
          raf = 0;
        }
        if (!interval) {
          interval = window.setInterval(() => sample(performance.now()), 80);
        }
      } else {
        if (interval) {
          window.clearInterval(interval);
          interval = 0;
        }
        if (!raf) raf = window.requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    onVis();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.cancelAnimationFrame(raf);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    for (const [id, tap] of audioTapsRef.current) {
      const row = mixer.sources.find((item) => item.id === id);
      if (!row) continue;
      tap.gain.gain.value = !row.visible || row.muted ? 0 : (row.volume ?? 1);
    }
  }, [mixer.sources]);

  useEffect(() => {
    const ids = new Set(mixer.sources.map((row) => row.id));
    for (const id of [...streamsRef.current.keys()]) {
      if (!ids.has(id)) dropStream(id);
    }
  }, [dropStream, mixer.sources]);

  useEffect(() => {
    const ids = new Set(mixer.sources.map((row) => row.id));
    for (const id of [...streamsRef.current.keys()]) {
      if (!ids.has(id)) dropStream(id);
    }
  }, [dropStream, mixer.sources]);

  const addCaptureSource = async (kind: "camera" | "screen") => {
    try {
      const stream = await openLiveCapture(kind);
      const track = stream.getVideoTracks()[0];
      const zoomRange = track ? trackZoomRange(track) : null;
      const cameraDeviceId = track?.getSettings?.().deviceId;
      editMixer((state) => {
        if (kind === "screen") {
          const selectedRow = state.selectedSourceId
            ? state.sources.find((row) => row.id === state.selectedSourceId)
            : null;
          const target =
            selectedRow?.kind === "screen" && selectedRow.offline
              ? selectedRow
              : state.sources.find((row) => row.kind === "screen" && row.offline);
          if (target) {
            attachCapture(target.id, stream);
            return patchSource(state, target.id, { offline: false });
          }
        }
        if (kind === "camera" && cameraDeviceId) {
          const existing = state.sources.find(
            (row) => row.kind === "camera" && row.cameraDeviceId === cameraDeviceId,
          );
          if (existing) {
            attachCapture(existing.id, stream);
            if (zoomRange && existing.zoom != null) {
              void applyTrackZoom(track, existing.zoom);
            }
            return patchSource(state, existing.id, {
              cameraDeviceId,
              zoomMin: zoomRange?.min,
              zoomMax: zoomRange?.max,
              zoomHardware: Boolean(zoomRange),
              offline: false,
              remembered: existing.remembered !== false,
            });
          }
        }
        const preset =
          kind === "camera" && cameraDeviceId
            ? loadPresetForSource({ kind: "camera", cameraDeviceId })
            : null;
        const next = addSourceToMixer(
          state,
          {
            kind,
            ...(preset ?? {}),
            name:
              preset?.name || (kind === "camera" ? "Camera" : "Screen"),
            cameraDeviceId,
            zoom: preset?.zoom ?? 1,
            zoomMin: zoomRange?.min ?? preset?.zoomMin,
            zoomMax: zoomRange?.max ?? preset?.zoomMax,
            zoomHardware: Boolean(zoomRange),
            remembered: kind === "camera" ? preset?.remembered !== false : false,
            offline: false,
          },
          kind === "screen" ? "back" : "front",
        );
        const added = next.sources[next.sources.length - 1];
        if (added) {
          attachCapture(added.id, stream);
          if (zoomRange && (preset?.zoom ?? 1) !== 1) {
            void applyTrackZoom(track, preset?.zoom ?? 1);
          }
        }
        return next;
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") return;
      toast.error(
        friendlyConvexError(
          error,
          kind === "screen" ? "Could not share the screen" : "Could not add that source",
        ),
      );
    }
  };

  const addAudioSource = async (kind: "mic" | "system") => {
    try {
      const stream =
        kind === "mic"
          ? await openMicCapture()
          : await openSystemAudioCapture(
              mixerRef.current.sources
                .filter((row) => row.kind === "screen")
                .map((row) => streamsRef.current.get(row.id))
                .filter((row): row is MediaStream => Boolean(row)),
            );
      editMixer((state) => {
        const target = state.sources.find((row) => row.kind === kind && row.offline);
        if (target) {
          attachCapture(target.id, stream);
          return patchSource(state, target.id, { offline: false });
        }
        const next = addSourceToMixer(state, {
          kind,
          name: kind === "mic" ? "Mic" : "System audio",
          offline: false,
        });
        const added = next.sources[next.sources.length - 1];
        if (added) attachCapture(added.id, stream);
        return next;
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") return;
      toast.error(
        friendlyConvexError(
          error,
          kind === "mic"
            ? "Could not add the microphone"
            : error instanceof Error
              ? error.message
              : "Could not capture system audio",
        ),
      );
    }
  };

  const addTextSource = () => {
    const text = window.prompt("Text on screen", "Live");
    if (text == null) return;
    editMixer((state) =>
      addSourceToMixer(state, { kind: "text", name: "Text", text: text.trim() || "Text" }),
    );
  };

  const addBackgroundSource = () => {
    editMixer((state) =>
      addSourceToMixer(state, { kind: "background", name: "Background" }, "back"),
    );
  };

  const onPickImage = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    editMixer((state) => {
      const next = addSourceToMixer(state, {
        kind: "image",
        name: file.name.replace(/\.[^.]+$/, "") || "Image",
        imageUrl: url,
      });
      const added = next.sources[next.sources.length - 1];
      if (added) {
        const image = new Image();
        image.src = url;
        imagesRef.current.set(added.id, image);
      }
      return next;
    });
  };

  const removeSource = (sourceId: string) => {
    const source = mixerRef.current.sources.find((row) => row.id === sourceId);
    dropStream(sourceId);
    if (source?.deviceId) {
      setDismissedDeviceIds((ids) =>
        ids.includes(source.deviceId!) ? ids : [...ids, source.deviceId!],
      );
    }
    if (source?.sessionId) {
      void endMine({ sessionId: source.sessionId as Id<"liveSessions"> });
    }
    setPendingDelete(null);
    editMixer((state) => removeSourceFromMixer(state, sourceId));
  };

  const removeSceneRow = (sceneId: string) => {
    const before = mixerRef.current;
    if (before.scenes.length <= 1) return;
    const scene = before.scenes.find((row) => row.id === sceneId);
    const keptIds = new Set(
      before.scenes
        .filter((row) => row.id !== sceneId)
        .flatMap((row) => row.sourceIds),
    );
    for (const sourceId of scene?.sourceIds ?? []) {
      if (keptIds.has(sourceId)) continue;
      const source = before.sources.find((row) => row.id === sourceId);
      dropStream(sourceId);
      if (source?.deviceId) {
        setDismissedDeviceIds((ids) =>
          ids.includes(source.deviceId!) ? ids : [...ids, source.deviceId!],
        );
      }
      if (source?.sessionId) {
        void endMine({ sessionId: source.sessionId as Id<"liveSessions"> });
      }
    }
    setPendingDelete(null);
    setIconPickerSceneId(null);
    editMixer((state) => removeScene(state, sceneId));
  };

  const openSceneIconPicker = (sceneId: string, button: HTMLButtonElement) => {
    setPendingDelete(null);
    if (iconPickerSceneId === sceneId) {
      setIconPickerSceneId(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const width = 228;
    setIconPickerPos({
      top: Math.min(window.innerHeight - 260, rect.bottom + 4),
      left: Math.min(window.innerWidth - width - 8, Math.max(8, rect.left)),
    });
    setIconPickerSceneId(sceneId);
  };

  const onLayerPointerDown = (
    sourceId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    layerDragRef.current = { id: sourceId };
    recordHistory(mixerRef.current);
    setDraggingLayer(sourceId);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = layerDragRef.current;
      if (!drag) return;
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const row = under?.closest("[data-layer-id]");
      if (!(row instanceof HTMLElement) || !row.dataset.layerId) return;
      const overId = row.dataset.layerId;
      setMixer((state) => {
        const ids = displayedSourceIds(state);
        const from = ids.indexOf(drag.id);
        const to = ids.indexOf(overId);
        if (from < 0 || to < 0 || from === to) return state;
        return reorderDisplayedSources(state, from, to);
      });
    };
    const onUp = () => {
      if (!layerDragRef.current) return;
      layerDragRef.current = null;
      setDraggingLayer(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const enterMaskPlace = (sourceId: string) => {
    pendingDragRef.current = null;
    dragRef.current = null;
    maskRevealRef.current = true;
    setMaskReveal(true);
    setMixer((state) => ({
      ...state,
      selectedSourceId: sourceId,
      selectedFocus: "mask",
    }));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!frameRef.current) return;
    const point = canvasPoint(
      frameRef.current,
      event.clientX,
      event.clientY,
      canvasSize.w,
      canvasSize.h,
    );
    const canvasAspect = canvasSize.ar;
    const current = mixerRef.current;
    const focus = current.selectedFocus ?? "video";
    const revealing =
      maskRevealRef.current && focus === "mask" && Boolean(current.selectedSourceId);
    const hit = hitMixerSource(
      sceneSources,
      point.x,
      point.y,
      canvasSize.w,
      canvasSize.h,
      {
        canvasAspect,
        hitMode: revealing ? "full" : "visible",
      },
    );
    if (!hit) {
      maskRevealRef.current = false;
      setMaskReveal(false);
      setMixer((state) => ({
        ...state,
        selectedSourceId: null,
        selectedFocus: "video",
      }));
      return;
    }
    const source = current.sources.find((row) => row.id === hit.sourceId);
    const mask = source ? resolvedMaskRect(source, canvasAspect) : null;
    const maskHandle = mask
      ? hitRectHandle(mask, point.x, point.y, canvasSize.w, canvasSize.h)
      : null;
    const onMaskEdge = Boolean(maskHandle && maskHandle !== "move");
    if (source && sourceHasMask(source) && event.detail >= 2) {
      enterMaskPlace(hit.sourceId);
      return;
    }
    const placingThis =
      revealing &&
      current.selectedSourceId === hit.sourceId &&
      Boolean(source && sourceHasMask(source));
    if (placingThis) {
      setMixer((state) => ({
        ...state,
        selectedSourceId: hit.sourceId,
        selectedFocus: "mask",
      }));
      pendingDragRef.current = {
        sourceId: hit.sourceId,
        handle: onMaskEdge ? maskHandle! : "move",
        lastX: point.x / canvasSize.w,
        lastY: point.y / canvasSize.h,
        target: "mask",
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
      return;
    }
    maskRevealRef.current = false;
    setMaskReveal(false);
    const target: LiveFocus = onMaskEdge ? "mask" : "video";
    const handle = onMaskEdge
      ? maskHandle!
      : source && sourceHasMask(source)
        ? "move"
        : hit.handle;
    setMixer((state) => ({
      ...state,
      selectedSourceId: hit.sourceId,
      selectedFocus: target,
    }));
    if (!handle) return;
    pendingDragRef.current = {
      sourceId: hit.sourceId,
      handle,
      lastX: point.x / canvasSize.w,
      lastY: point.y / canvasSize.h,
      target,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!frameRef.current) return;
    const point = canvasPoint(
      frameRef.current,
      event.clientX,
      event.clientY,
      canvasSize.w,
      canvasSize.h,
    );
    const hit = hitMixerSource(
      sceneSources,
      point.x,
      point.y,
      canvasSize.w,
      canvasSize.h,
      { canvasAspect: canvasSize.ar, hitMode: "full" },
    );
    const source = hit
      ? mixerRef.current.sources.find((row) => row.id === hit.sourceId)
      : null;
    if (!source || !sourceHasMask(source)) return;
    event.preventDefault();
    enterMaskPlace(source.id);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!frameRef.current) return;
    const point = canvasPoint(
      frameRef.current,
      event.clientX,
      event.clientY,
      canvasSize.w,
      canvasSize.h,
    );
    const pending = pendingDragRef.current;
    if (pending && !dragRef.current) {
      const moved = Math.hypot(
        event.clientX - pending.startClientX,
        event.clientY - pending.startClientY,
      );
      if (moved < 6) return;
      if (!dragDidRecordRef.current) {
        recordHistory(mixerRef.current);
        dragDidRecordRef.current = true;
      }
      dragRef.current = {
        sourceId: pending.sourceId,
        handle: pending.handle,
        lastX: pending.lastX,
        lastY: pending.lastY,
        target: pending.target,
      };
      pendingDragRef.current = null;
      event.currentTarget.setPointerCapture(pending.pointerId);
    }
    const drag = dragRef.current;
    const canvasAspect = canvasSize.w / Math.max(canvasSize.h, 1);
    if (!drag) {
      const selectedRow = mixerRef.current.sources.find(
        (row) => row.id === mixerRef.current.selectedSourceId,
      );
      const focus = mixerRef.current.selectedFocus ?? "video";
      const revealing = maskRevealRef.current && focus === "mask";
      if (selectedRow && focus === "mask" && sourceHasMask(selectedRow)) {
        const mask = resolvedMaskRect(selectedRow, canvasAspect);
        if (mask) {
          const handle = hitRectHandle(
            mask,
            point.x,
            point.y,
            canvasSize.w,
            canvasSize.h,
          );
          if (handle) {
            event.currentTarget.style.cursor = cursorForHandle(handle);
            return;
          }
        }
        if (revealing) {
          event.currentTarget.style.cursor = "default";
          return;
        }
      }
      const hit = hitMixerSource(
        sceneSources,
        point.x,
        point.y,
        canvasSize.w,
        canvasSize.h,
        {
          canvasAspect,
          hitMode: revealing ? "full" : "visible",
        },
      );
      event.currentTarget.style.cursor = cursorForHandle(hit?.handle ?? null);
      return;
    }
    const nx = point.x / canvasSize.w;
    const ny = point.y / canvasSize.h;
    const dx = nx - drag.lastX;
    const dy = ny - drag.lastY;
    drag.lastX = nx;
    drag.lastY = ny;
    const source = mixerRef.current.sources.find((row) => row.id === drag.sourceId);
    if (!source) return;
    const others: LiveRect[] = [];
    for (const row of activeSources(mixerRef.current)) {
      if (row.id === drag.sourceId || !row.visible) continue;
      others.push(resolvedMaskRect(row, canvasAspect) ?? row.rect);
    }
    const frameW = frameRef.current.clientWidth || canvasSize.w;
    const threshold = Math.max(0.01, 8 / frameW);
    if (drag.target === "mask") {
      const mask = resolvedMaskRect(source, canvasAspect);
      if (!mask) return;
      others.push(source.rect);
      const nextRect = applyHandle(mask, drag.handle, dx, dy);
      const aspect = maskNormalizedAspect(source.shape, canvasAspect);
      const locked = aspect
        ? lockRectToAspect(mask, nextRect, drag.handle, aspect)
        : nextRect;
      const snapped = snapLiveRect(locked, drag.handle, others, threshold);
      setSnapGuides(snapped.guides);
      setMixer((state) => patchSource(state, drag.sourceId, { maskRect: snapped.rect }));
      return;
    }
    const nextRect = applyHandle(source.rect, drag.handle, dx, dy);
    const aspect = videoNormalizedAspect(source.mediaAspect, canvasAspect);
    const locked = aspect
      ? lockRectToAspect(source.rect, nextRect, drag.handle, aspect)
      : nextRect;
    const snapped = snapLiveRect(locked, drag.handle, others, threshold);
    setSnapGuides(snapped.guides);
    setMixer((state) => patchSource(state, drag.sourceId, { rect: snapped.rect }));
  };

  const onPointerUp = () => {
    pendingDragRef.current = null;
    dragRef.current = null;
    dragDidRecordRef.current = false;
    setSnapGuides({ x: null, y: null });
  };

  const startRecording = async () => {
    const canvas = canvasRef.current;
    if (!canvas || recordingRef.current || saving) return;
    setRecordLayout(canvasSize);
    const canvasStream = canvas.captureStream(30);
    const mixed = new MediaStream(canvasStream.getVideoTracks());
    const mixAudio = mixDestRef.current?.stream.getAudioTracks()[0];
    if (mixAudio) mixed.addTrack(mixAudio);
    else {
      for (const stream of streamsRef.current.values()) {
        for (const track of stream.getAudioTracks()) mixed.addTrack(track);
      }
    }
    const mime = pickRecorderMime();
    const recorder = mime
      ? new MediaRecorder(mixed, {
          mimeType: mime,
          videoBitsPerSecond: SCREEN_SHARE_VIDEO_BPS,
        })
      : new MediaRecorder(mixed);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      void saveRecording(recorder.mimeType);
    };
    recorderRef.current = recorder;
    recordStartedAt.current = Date.now();
    setElapsedMs(0);
    recorder.start(500);
    setRecording(true);
    const ctx = audioCtxRef.current;
    if (ctx && !keepAwakeRef.current) {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.00001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        keepAwakeRef.current = { osc, gain };
      } catch {
        /* keep-awake is best-effort */
      }
    }
    const lockNav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (lockNav.wakeLock?.request) {
      void lockNav.wakeLock.request("screen").then((lock) => {
        wakeLockRef.current = lock;
      }).catch(() => {});
    }
  };

  const saveRecording = async (mimeType: string) => {
    setSaving(true);
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
      chunksRef.current = [];
      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      const file = new File(
        [blob],
        `Live ${new Date().toISOString().slice(0, 19).replace("T", " ")}.${ext}`,
        { type: blob.type },
      );
      const folderId = await ensureScreenRecordings({});
      await uploadStudioAsset({
        file,
        folderId,
        kind: "video",
        name: file.name,
        reserveUpload,
        commitStagingUpload,
      });
      toast.success("Saved to Screen Recordings");
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1400);
    } catch (error) {
      toast.error(friendlyConvexError(error, "Could not save the recording"));
    } finally {
      setSaving(false);
    }
  };

  const stopRecording = () => {
    setSaving(true);
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    setRecordLayout(null);
    try {
      keepAwakeRef.current?.osc.stop();
    } catch {
      /* already stopped */
    }
    keepAwakeRef.current = null;
    void wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  };

  const previewBox = frameRef.current
    ? canvasPoint(frameRef.current, 0, 0, canvasSize.w, canvasSize.h)
    : { w: canvasSize.w, h: canvasSize.h };
  const selectedFocus = mixer.selectedFocus ?? "video";
  const selectedOnCanvas = selected && !isAudioOnlyKind(selected.kind) ? selected : null;
  const maskRevealed =
    maskReveal && selectedFocus === "mask" && Boolean(selectedOnCanvas && sourceHasMask(selectedOnCanvas));
  const videoBox =
    selectedOnCanvas && (maskRevealed || !sourceHasMask(selectedOnCanvas))
      ? overlayBoxStyle(selectedOnCanvas.rect, 0, previewBox.w, previewBox.h)
      : null;
  const maskBox =
    selectedOnCanvas && sourceHasMask(selectedOnCanvas)
      ? (() => {
          const mask = resolvedMaskRect(selectedOnCanvas, canvasSize.ar);
          if (!mask) return null;
          const radius = maskRevealed
            ? resolveLiveSource(selectedOnCanvas).radius ?? 0
            : 0;
          return overlayBoxStyle(mask, radius, previewBox.w, previewBox.h);
        })()
      : null;
  const maskRatioKind =
    selectedOnCanvas && sourceHasMask(selectedOnCanvas) && !maskRevealed
      ? liveRectRatioKind(resolvedMaskRect(selectedOnCanvas, canvasSize.ar) ?? selectedOnCanvas.rect, canvasSize.ar)
      : null;
  const gapRect =
    selectedOnCanvas && sourceHasMask(selectedOnCanvas)
      ? resolvedMaskRect(selectedOnCanvas, canvasSize.ar)
      : selectedOnCanvas?.rect ?? null;
  const gapSides = (() => {
    if (!gapRect) return [] as LiveEdgeSide[];
    const gaps = liveRectCanvasGaps(gapRect);
    const sides = gapFlash
      ? (["left", "right", "top", "bottom"] as LiveEdgeSide[])
      : nearLiveEdgeSides(gaps);
    return sides.filter((side) => gaps[side] >= 0);
  })();

  const phoneBridges = mixer.sources.filter(
    (row) => row.kind === "phone" && row.sessionId,
  );
  const recLabel = saving
    ? "Saving…"
    : recording
      ? formatClock(elapsedMs)
      : savedFlash
        ? "Saved"
        : "Rec";
  const recTitle = saving
    ? "Saving recording"
    : recording
      ? "Stop recording"
      : "Record";

  const addMenu = (
    <div className="studio-live-add-menu">
      <button
        ref={addBtnRef}
        type="button"
        className="studio-live-icon-btn"
        aria-label="Add source"
        aria-expanded={addOpen}
        onClick={() => setAddOpen((open) => !open)}
      >
        <Plus size={14} />
      </button>
      {addOpen && addMenuPos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={addMenuRef}
              className="cursor-dropdown is-end"
              style={{
                position: "fixed",
                top: addMenuPos.top,
                bottom: addMenuPos.bottom,
                right: addMenuPos.right,
                left: "auto",
                marginBottom: 0,
                zIndex: 80,
              }}
              role="menu"
              aria-label="Add source"
            >
              <button
                type="button"
                className="cursor-dropdown-item"
                onClick={() => {
                  setAddOpen(false);
                  addBackgroundSource();
                }}
              >
                <Palette size={14} aria-hidden="true" />
                Background
              </button>
              <button
                type="button"
                className="cursor-dropdown-item"
                onClick={() => {
                  setAddOpen(false);
                  void addCaptureSource("camera");
                }}
              >
                <Camera size={14} aria-hidden="true" />
                Camera
              </button>
              <button
                type="button"
                className="cursor-dropdown-item"
                onClick={() => {
                  setAddOpen(false);
                  void addCaptureSource("screen");
                }}
              >
                <Monitor size={14} aria-hidden="true" />
                Screen
              </button>
              <button
                type="button"
                className="cursor-dropdown-item"
                onClick={() => {
                  setAddOpen(false);
                  void addAudioSource("mic");
                }}
              >
                <Mic size={14} aria-hidden="true" />
                Mic
              </button>
              <button
                type="button"
                className="cursor-dropdown-item"
                onClick={() => {
                  setAddOpen(false);
                  void addAudioSource("system");
                }}
              >
                <AudioLines size={14} aria-hidden="true" />
                System audio
              </button>
              {onlinePhones.length === 0 ? (
                <button type="button" className="cursor-dropdown-item" disabled>
                  <Smartphone size={14} aria-hidden="true" />
                  Phone — none online
                </button>
              ) : (
                onlinePhones.map((device) => (
                  <button
                    key={device._id}
                    type="button"
                    className="cursor-dropdown-item"
                    onClick={() => {
                      setAddOpen(false);
                      setDismissedDeviceIds((ids) =>
                        ids.filter((id) => id !== device._id),
                      );
                      void claimPhone(device._id, device.label, device.deviceKey);
                    }}
                  >
                    <Smartphone size={14} aria-hidden="true" />
                    {device.label}
                  </button>
                ))
              )}
              <button
                type="button"
                className="cursor-dropdown-item"
                onClick={() => {
                  setAddOpen(false);
                  imageInputRef.current?.click();
                }}
              >
                <ImageIcon size={14} aria-hidden="true" />
                Image
              </button>
              <button
                type="button"
                className="cursor-dropdown-item"
                onClick={() => {
                  setAddOpen(false);
                  addTextSource();
                }}
              >
                <Type size={14} aria-hidden="true" />
                Text
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );

  return (
    <div className="studio-live">
      {phoneBridges.map((source) => (
        <LivePhoneBridge
          key={source.sessionId}
          sessionId={source.sessionId as Id<"liveSessions">}
          sourceId={source.id}
          bindStream={bindStream}
          dropStream={dropStream}
          onEnded={() => {
            dropStream(source.id);
            setMixer((state) => {
              const row = state.sources.find((item) => item.id === source.id);
              if (row?.remembered === false) {
                return removeSourceFromMixer(state, source.id);
              }
              return patchSource(state, source.id, {
                offline: true,
                sessionId: undefined,
              });
            });
          }}
          onRestart={() => {
            const row = mixerRef.current.sources.find((item) => item.id === source.id);
            if (!row?.deviceId) return;
            const last = lastClaimAtRef.current.get(row.deviceId) ?? 0;
            if (Date.now() - last < 1500) return;
            lastClaimAtRef.current.set(row.deviceId, Date.now());
            void claimPhone(
              row.deviceId as Id<"liveDevices">,
              row.name,
              row.deviceKey,
              true,
              true,
            );
          }}
        />
      ))}
      <div className="studio-live-shell">
        <PanelGroup
          direction="horizontal"
          autoSaveId="studio-live-mixer-h"
          className="studio-live-shell-panels"
        >
          <Panel defaultSize={78} minSize={48} className="min-h-0 min-w-0">
        <div className="studio-live-workspace">
          <PanelGroup
            direction="vertical"
            autoSaveId="studio-live-mixer-v"
            className="studio-live-panels"
          >
            <Panel defaultSize={62} minSize={28} className="min-h-0 min-w-0">
              <div className="studio-live-preview">
                <div className="studio-live-preview-head">
                  <div className="studio-live-head-meta">
                    <button
                      type="button"
                      className="studio-live-icon-btn"
                      aria-label="Undo"
                      title="Undo"
                      disabled={!canUndo}
                      onClick={undoMixer}
                    >
                      <Undo2 size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="studio-live-icon-btn"
                      aria-label="Redo"
                      title="Redo"
                      disabled={!canRedo}
                      onClick={redoMixer}
                    >
                      <Redo2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className={`studio-live-rec${recording ? " is-on" : ""}${saving ? " is-saving" : ""}${savedFlash ? " is-saved" : ""}`}
                    disabled={saving || savedFlash || (!recording && sceneSources.length === 0)}
                    aria-label={recTitle}
                    aria-busy={saving}
                    title={recTitle}
                    onClick={() => {
                      if (saving || savedFlash) return;
                      if (recording) stopRecording();
                      else void startRecording();
                    }}
                  >
                    {saving ? (
                      <Loader2
                        className="studio-live-rec-spin"
                        size={12}
                        aria-hidden="true"
                      />
                    ) : recording ? (
                      <Square size={10} aria-hidden="true" />
                    ) : savedFlash ? (
                      <Check size={12} aria-hidden="true" />
                    ) : (
                      <span className="studio-live-rec-dot" aria-hidden="true" />
                    )}
                    <span className="studio-live-rec-label">{recLabel}</span>
                  </button>
                </div>
                <div
                  className="studio-live-stage"
                  onPointerDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    maskRevealRef.current = false;
                    setMaskReveal(false);
                    setMixer((state) => ({
                      ...state,
                      selectedSourceId: null,
                      selectedFocus: "video",
                    }));
                  }}
                >
                  <div
                    className="studio-live-frame"
                    ref={frameRef}
                    style={{ "--preview-ar": String(canvasSize.ar) } as CSSProperties}
                  >
                    <canvas ref={canvasRef} className="studio-live-canvas" />
                    <div
                      className="studio-live-hit"
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerUp}
                      onDoubleClick={onDoubleClick}
                    />
                    {videoBox ? (
                      <div
                        className={`studio-live-box${maskRevealed ? " is-ghost" : " is-active"}`}
                        style={videoBox}
                      >
                        {!maskRevealed
                          ? ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((handle) => (
                              <span key={handle} className={`studio-live-handle is-${handle}`} />
                            ))
                          : null}
                      </div>
                    ) : null}
                    {maskBox ? (
                      <div
                        className="studio-live-box is-mask is-active"
                        style={maskBox}
                      >
                        {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((handle) => (
                          <span key={handle} className={`studio-live-handle is-${handle}`} />
                        ))}
                        {maskRatioKind ? (
                          <span className="studio-live-ratio-tag">
                            {maskRatioKind === "square" ? "Square" : "Rectangle"}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {gapRect
                      ? gapSides.map((side) => {
                          const gaps = liveRectCanvasGaps(gapRect);
                          const px = Math.round(
                            gaps[side] *
                              (side === "left" || side === "right"
                                ? previewBox.w
                                : previewBox.h),
                          );
                          return (
                            <LiveEdgeGap
                              key={side}
                              side={side}
                              rect={gapRect}
                              px={px}
                            />
                          );
                        })
                      : null}
                    <span
                      className={`studio-editor-transform-guide is-vertical${snapGuides.x === 0.5 ? " is-center" : ""}`}
                      style={{
                        display: snapGuides.x == null ? "none" : "block",
                        left: snapGuides.x == null ? undefined : `${snapGuides.x * 100}%`,
                      }}
                    />
                    <span
                      className={`studio-editor-transform-guide is-horizontal${snapGuides.y === 0.5 ? " is-center" : ""}`}
                      style={{
                        display: snapGuides.y == null ? "none" : "block",
                        top: snapGuides.y == null ? undefined : `${snapGuides.y * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </Panel>
            <PanelResizeHandle className="cursor-resize-v" />
            <Panel defaultSize={38} minSize={22} className="min-h-0 min-w-0">
              <div className="studio-live-bottom">
                <div className="studio-live-bottom-split">
                  <PanelGroup
                    direction="horizontal"
                    autoSaveId="studio-live-bottom-h"
                    className="studio-live-bottom-panels"
                  >
                    <Panel defaultSize={58} minSize={28} className="min-h-0 min-w-0">
                      <div className="studio-live-sources-dock">
                        <div className="studio-live-scenes-col">
                          <div className="studio-live-pane-head">
                            <span>Scenes</span>
                            <button
                              type="button"
                              className="studio-live-icon-btn"
                              aria-label="Add scene"
                              title="Add scene"
                              onClick={() => editMixer((state) => addScene(state))}
                            >
                              <Layers size={14} />
                            </button>
                          </div>
                    <div className="studio-live-list">
                      {mixer.scenes.map((scene) => {
                        const SceneIcon = dmLabelIcon(sceneIconKey(scene));
                        const canRemove = mixer.scenes.length > 1;
                        const armed =
                          pendingDelete?.kind === "scene" &&
                          pendingDelete.id === scene.id;
                        return (
                          <div
                            key={scene.id}
                            className={`studio-live-row${scene.id === mixer.activeSceneId ? " is-active" : ""}`}
                          >
                            <button
                              type="button"
                              data-live-scene-icon=""
                              className="studio-live-scene-icon"
                              aria-label="Scene icon"
                              aria-expanded={iconPickerSceneId === scene.id}
                              title="Scene icon"
                              onClick={(event) =>
                                openSceneIconPicker(scene.id, event.currentTarget)
                              }
                            >
                              <SceneIcon size={14} aria-hidden="true" />
                            </button>
                            <LiveRowName
                              name={scene.name}
                              renaming={
                                renaming?.kind === "scene" && renaming.id === scene.id
                              }
                              onSelect={() => {
                                setMaskReveal(false);
                                setMixer((state) => ({
                                  ...state,
                                  activeSceneId: scene.id,
                                  selectedSourceId: null,
                                  selectedFocus: "video",
                                }));
                              }}
                              onStartRename={() => {
                                setPendingDelete(null);
                                setRenaming({ kind: "scene", id: scene.id });
                              }}
                              onCommit={(name) =>
                                editMixer((state) =>
                                  patchScene(state, scene.id, { name }),
                                )
                              }
                              onDismiss={() => setRenaming(null)}
                            />
                            {canRemove ? (
                              <LiveConfirmTrash
                                armed={armed}
                                label="Remove scene"
                                onArm={() => {
                                  setIconPickerSceneId(null);
                                  setPendingDelete({ kind: "scene", id: scene.id });
                                }}
                                onConfirm={() => removeSceneRow(scene.id)}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="studio-live-sources-col">
                    <div className="studio-live-pane-head">
                      <span>Sources</span>
                      {addMenu}
                    </div>
                    <div className="studio-live-list">
                      {layerSources.length === 0 ? (
                        <p className="studio-live-status" style={{ padding: "6px 8px" }}>
                          Add a camera, screen, background, or phone.
                        </p>
                      ) : (
                        layerSources.map((source) => (
                          <div
                            key={source.id}
                            data-layer-id={source.id}
                            className={`studio-live-row${
                              source.id === mixer.selectedSourceId ? " is-selected" : ""
                            }${draggingLayer === source.id ? " is-dragging" : ""}${
                              source.offline ? " is-offline" : ""
                            }`}
                          >
                            <button
                              type="button"
                              className="studio-live-grip"
                              aria-label="Reorder layer"
                              onPointerDown={(event) => onLayerPointerDown(source.id, event)}
                            >
                              <GripVertical size={14} aria-hidden="true" />
                            </button>
                            <LiveRowName
                              name={source.name}
                              renaming={
                                renaming?.kind === "source" && renaming.id === source.id
                              }
                              onSelect={() => {
                                maskRevealRef.current = false;
                                setMaskReveal(false);
                                setMixer((state) => ({
                                  ...state,
                                  selectedSourceId: source.id,
                                  selectedFocus: sourceHasMask(source) ? "mask" : "video",
                                }));
                              }}
                              onStartRename={() => {
                                setPendingDelete(null);
                                setRenaming({ kind: "source", id: source.id });
                              }}
                              onCommit={(name) =>
                                editMixer((state) =>
                                  patchSource(state, source.id, { name }),
                                )
                              }
                              onDismiss={() => setRenaming(null)}
                            />
                            {source.kind === "screen" && !source.offline ? (
                              <button
                                type="button"
                                className="studio-live-icon-btn"
                                aria-label="Stop share"
                                title="Stop share"
                                onClick={() => stopCapture(source.id)}
                              >
                                <MonitorOff size={14} />
                              </button>
                            ) : source.offline &&
                              (source.kind === "screen" ||
                                source.kind === "camera" ||
                                isAudioOnlyKind(source.kind)) ? (
                              <button
                                type="button"
                                className="studio-live-icon-btn"
                                aria-label={
                                  source.kind === "screen"
                                    ? "Share screen"
                                    : source.kind === "mic"
                                      ? "Reconnect mic"
                                      : source.kind === "system"
                                        ? "Reconnect system audio"
                                        : "Reconnect camera"
                                }
                                title={
                                  source.kind === "screen"
                                    ? "Share screen"
                                    : source.kind === "mic"
                                      ? "Reconnect mic"
                                      : source.kind === "system"
                                        ? "Reconnect system audio"
                                        : "Reconnect camera"
                                }
                                onClick={() => void reconnectCapture(source.id)}
                              >
                                {source.kind === "mic" ? (
                                  <Mic size={14} />
                                ) : source.kind === "system" ? (
                                  <AudioLines size={14} />
                                ) : source.kind === "screen" ? (
                                  <Monitor size={14} />
                                ) : (
                                  <Camera size={14} />
                                )}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="studio-live-icon-btn"
                              aria-label={source.visible ? "Hide" : "Show"}
                              onClick={() =>
                                editMixer((state) =>
                                  patchSource(state, source.id, {
                                    visible: !source.visible,
                                  }),
                                )
                              }
                            >
                              {source.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                            <LiveConfirmTrash
                              armed={
                                pendingDelete?.kind === "source" &&
                                pendingDelete.id === source.id
                              }
                              label="Remove"
                              onArm={() => {
                                setIconPickerSceneId(null);
                                setPendingDelete({ kind: "source", id: source.id });
                              }}
                              onConfirm={() => removeSource(source.id)}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                      </div>
                    </Panel>
                    <PanelResizeHandle className="cursor-resize" />
                    <Panel defaultSize={42} minSize={22} className="min-h-0 min-w-0">
                      <StudioLiveAudioMixer
                        sources={layerSources}
                        levels={levels}
                        selectedSourceId={mixer.selectedSourceId}
                        onSelect={(sourceId) => {
                          const row = mixerRef.current.sources.find((item) => item.id === sourceId);
                          maskRevealRef.current = false;
                          setMaskReveal(false);
                          setMixer((state) => ({
                            ...state,
                            selectedSourceId: sourceId,
                            selectedFocus: row && sourceHasMask(row) ? "mask" : "video",
                          }));
                        }}
                        onVolume={(sourceId, volume) => {
                          const tap = audioTapsRef.current.get(sourceId);
                          if (tap) {
                            const muted = mixerRef.current.sources.find((row) => row.id === sourceId)
                              ?.muted;
                            tap.gain.gain.value = muted ? 0 : volume;
                          }
                          editMixer((state) => patchSource(state, sourceId, { volume }), "coalesce");
                        }}
                        onMute={(sourceId, muted) => {
                          const tap = audioTapsRef.current.get(sourceId);
                          const volume =
                            mixerRef.current.sources.find((row) => row.id === sourceId)?.volume ?? 1;
                          if (tap) tap.gain.gain.value = muted ? 0 : volume;
                          editMixer((state) => patchSource(state, sourceId, { muted }));
                        }}
                      />
                    </Panel>
                  </PanelGroup>
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </div>
          </Panel>
          <PanelResizeHandle className="cursor-resize" />
          <Panel defaultSize={22} minSize={16} maxSize={40} className="min-h-0 min-w-0">
        <StudioLiveInspector
          selected={selected ?? null}
          scene={activeScene}
          recording={recording}
          focus={selectedFocus}
          camera={
            selected && (selected.kind === "phone" || selected.kind === "camera")
              ? (() => {
                  const liveDevice = (devices ?? []).find(
                    (row) =>
                      row._id === selected.deviceId ||
                      row.deviceKey === selected.deviceKey,
                  );
                  const facing =
                    liveDevice?.facing ?? selected.facing ?? "environment";
                  const torch = Boolean(liveDevice?.torch ?? selected.torch);
                  const mirror = Boolean(liveDevice?.mirror ?? selected.mirror);
                  const torchAvailable =
                    selected.kind === "phone" ||
                    trackCanTorch(
                      streamsRef.current.get(selected.id)?.getVideoTracks()[0],
                    );
                  return {
                  provider: selected.kind === "phone" ? "Phone" : "This computer",
                  cameras: [],
                  showFacing: selected.kind === "phone",
                  facing,
                  torch,
                  mirror,
                  torchAvailable,
                  zoom: selected.zoom ?? 1,
                  zoomMin: selected.zoomMin ?? 1,
                  zoomMax:
                    selected.zoomMax ??
                    (selected.zoomHardware ? 2 : LIVE_DIGITAL_ZOOM_MAX),
                  onFacing: (nextFacing) => {
                    editMixer((state) =>
                      patchSource(state, selected.id, {
                        facing: nextFacing,
                        torch,
                      }),
                    );
                    if (selected.deviceId) {
                      void setDeviceCamera({
                        deviceId: selected.deviceId as Id<"liveDevices">,
                        facing: nextFacing,
                        torch,
                      });
                    }
                  },
                  onMirror: (nextMirror) => {
                    editMixer((state) =>
                      patchSource(state, selected.id, { mirror: nextMirror }),
                    );
                    persistSourcePreset({ ...selected, mirror: nextMirror });
                    if (selected.kind === "phone" && selected.deviceId) {
                      void setDeviceCamera({
                        deviceId: selected.deviceId as Id<"liveDevices">,
                        mirror: nextMirror,
                      });
                    }
                  },
                  onTorch: (nextTorch) => {
                    editMixer((state) =>
                      patchSource(state, selected.id, { torch: nextTorch }),
                    );
                    if (selected.kind === "phone" && selected.deviceId) {
                      void setDeviceCamera({
                        deviceId: selected.deviceId as Id<"liveDevices">,
                        torch: nextTorch,
                      });
                    } else {
                      const stream = streamsRef.current.get(selected.id);
                      void applyTrackTorch(
                        stream?.getVideoTracks()[0],
                        nextTorch,
                      );
                    }
                  },
                  onZoom: (zoom) => {
                    editMixer((state) => patchSource(state, selected.id, { zoom }), "coalesce");
                    persistSourcePreset({ ...selected, zoom });
                    if (selected.kind === "phone" && selected.deviceId) {
                      void setDeviceCamera({
                        deviceId: selected.deviceId as Id<"liveDevices">,
                        zoom,
                      });
                    } else if (selected.zoomHardware) {
                      const stream = streamsRef.current.get(selected.id);
                      void applyTrackZoom(stream?.getVideoTracks()[0], zoom);
                    }
                  },
                  };
                })()
              : null
          }
          onPatch={(patch) => {
            if (!selected) return;
            if (patch.shape === "none" || patch.shape) {
              maskRevealRef.current = false;
              setMaskReveal(false);
            }
            editMixer((state) => {
              const next = patchSource(state, selected.id, patch);
              if (patch.shape === "none") {
                return { ...next, selectedFocus: "video" };
              }
              if (patch.shape) {
                return { ...next, selectedFocus: "mask" };
              }
              return next;
            }, "coalesce");
          }}
          onScenePatch={(patch) => {
            if (!activeScene) return;
            editMixer((state) => patchScene(state, activeScene.id, patch));
          }}
          onRemember={(on) => {
            if (!selected) return;
            if (!on) forgetDevicePreset(selected);
          }}
          onReconnect={
            selected &&
            (selected.kind === "screen" ||
              selected.kind === "camera" ||
              isAudioOnlyKind(selected.kind))
              ? () => void reconnectCapture(selected.id)
              : undefined
          }
          onStopShare={
            selected?.kind === "screen" && !selected.offline
              ? () => stopCapture(selected.id)
              : undefined
          }
        />
          </Panel>
        </PanelGroup>
      </div>
      {iconPickerSceneId && iconPickerPos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={iconPickerRef}
              className="studio-live-icon-pop"
              style={{ top: iconPickerPos.top, left: iconPickerPos.left }}
              role="listbox"
              aria-label="Scene icon"
            >
              <div className="studio-live-icon-grid">
                {DM_LABEL_ICON_OPTIONS.map(({ key, Icon, label }) => {
                  const current = mixer.scenes.find(
                    (row) => row.id === iconPickerSceneId,
                  );
                  const active = sceneIconKey(current ?? {}) === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`studio-live-icon-opt${active ? " is-active" : ""}`}
                      title={label}
                      onClick={() => {
                        editMixer((state) =>
                          patchScene(state, iconPickerSceneId, { icon: key }),
                        );
                        setIconPickerSceneId(null);
                      }}
                    >
                      <Icon size={16} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
      <div className="studio-live-hidden">
        {mixer.sources
          .filter((source) => !isAudioOnlyKind(source.kind))
          .map((source) => (
          <video
            key={source.id}
            ref={(node) => {
              if (node) {
                videosRef.current.set(source.id, node);
                const stream = streamsRef.current.get(source.id);
                if (stream && node.srcObject !== stream) {
                  node.srcObject = stream;
                  void node.play().catch(() => {});
                }
              } else {
                videosRef.current.delete(source.id);
              }
            }}
            playsInline
            muted
            autoPlay
          />
        ))}
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          onPickImage(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
