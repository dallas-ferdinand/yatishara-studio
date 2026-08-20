export const LIVE_CANVAS_W = 1920;
export const LIVE_CANVAS_H = 1080;

export type LiveFrameRatio = "16:9" | "9:16" | "1:1";

export const LIVE_FRAME_PRESETS: Array<{
  id: LiveFrameRatio;
  label: string;
  shortLabel: string;
  w: number;
  h: number;
  cssRatio: string;
}> = [
  { id: "16:9", label: "Landscape", shortLabel: "16:9", w: 1920, h: 1080, cssRatio: "16 / 9" },
  { id: "9:16", label: "Portrait", shortLabel: "9:16", w: 1080, h: 1920, cssRatio: "9 / 16" },
  { id: "1:1", label: "Square", shortLabel: "1:1", w: 1080, h: 1080, cssRatio: "1 / 1" },
];

export const DEFAULT_FRAME_RATIO: LiveFrameRatio = "16:9";

export function normalizeLiveFrameRatio(value: unknown): LiveFrameRatio {
  if (value === "9:16" || value === "1:1" || value === "16:9") return value;
  return DEFAULT_FRAME_RATIO;
}

export function liveCanvasSize(ratio?: LiveFrameRatio | string | null) {
  const id = normalizeLiveFrameRatio(ratio);
  const preset =
    LIVE_FRAME_PRESETS.find((row) => row.id === id) ?? LIVE_FRAME_PRESETS[0]!;
  return {
    w: preset.w,
    h: preset.h,
    cssRatio: preset.cssRatio,
    ar: preset.w / preset.h,
    id,
  };
}

export type LiveSourceKind =
  | "camera"
  | "screen"
  | "phone"
  | "mic"
  | "system"
  | "image"
  | "text"
  | "background";

export function isAudioOnlyKind(kind: LiveSourceKind) {
  return kind === "mic" || kind === "system";
}

export function sourceHasAudioMix(kind: LiveSourceKind) {
  return (
    kind === "camera" ||
    kind === "screen" ||
    kind === "phone" ||
    kind === "mic" ||
    kind === "system"
  );
}

export type LiveShape = "none" | "rectangle" | "square" | "circle";
export type LiveFocus = "video" | "mask";

export type LiveShadow = {
  enabled: boolean;
  blur: number;
  color: string;
  opacity: number;
};

export type LiveFill = {
  mode: "solid" | "gradient";
  color: string;
  color2: string;
  angle: number;
};

export type LiveRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LiveBorder = {
  enabled: boolean;
  width: number;
  color: string;
};

export type LiveSource = {
  id: string;
  kind: LiveSourceKind;
  name: string;
  visible: boolean;
  rect: LiveRect;
  radius?: number;
  shape?: LiveShape;
  /** Crop window in canvas space, kept inside `rect` when a mask is on. */
  maskRect?: LiveRect;
  opacity?: number;
  shadow?: LiveShadow;
  border?: LiveBorder;
  maskBorder?: LiveBorder;
  fill?: LiveFill;
  text?: string;
  imageUrl?: string;
  deviceId?: string;
  sessionId?: string;
  cameraDeviceId?: string;
  cameraLabel?: string;
  facing?: "user" | "environment";
  torch?: boolean;
  /** Flip the picture left-right on the canvas / record. */
  mirror?: boolean;
  zoom?: number;
  zoomMin?: number;
  zoomMax?: number;
  zoomHardware?: boolean;
  volume?: number;
  muted?: boolean;
  /** Pixel width / height of the camera or image, once known. */
  mediaAspect?: number;
  deviceKey?: string;
  remembered?: boolean;
  offline?: boolean;
};

export const LIVE_DIGITAL_ZOOM_MAX = 4;

export function compositorZoom(source: Pick<LiveSource, "zoom" | "zoomHardware">) {
  if (source.zoomHardware) return 1;
  const zoom = source.zoom ?? 1;
  return Math.min(LIVE_DIGITAL_ZOOM_MAX, Math.max(1, zoom));
}

export const DEFAULT_SCENE_ICON = "layers";

export type LiveScene = {
  id: string;
  name: string;
  icon?: string;
  frameRatio?: LiveFrameRatio;
  sourceIds: string[];
};

export type LiveMixerState = {
  scenes: LiveScene[];
  activeSceneId: string;
  sources: LiveSource[];
  selectedSourceId: string | null;
  selectedFocus?: LiveFocus;
};

export type LiveHandle =
  | "move"
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

const MIN_SIZE = 0.03;

export const DEFAULT_SHADOW: LiveShadow = {
  enabled: false,
  blur: 28,
  color: "#000000",
  opacity: 0.4,
};

export const DEFAULT_BORDER: LiveBorder = {
  enabled: false,
  width: 6,
  color: "#ffffff",
};

export const DEFAULT_FILL: LiveFill = {
  mode: "solid",
  color: "#111318",
  color2: "#0b0d12",
  angle: 160,
};

export function defaultSourceStyle(
  kind: LiveSourceKind,
): Pick<LiveSource, "radius" | "shape" | "opacity" | "shadow" | "fill" | "border"> {
  const cameraLike = kind === "camera" || kind === "phone";
  return {
    radius: 0,
    shape: "none",
    opacity: 1,
    shadow: { ...DEFAULT_SHADOW, enabled: cameraLike },
    border: { ...DEFAULT_BORDER },
    fill:
      kind === "background"
        ? {
            mode: "gradient",
            color: "#2a3140",
            color2: "#0b0d12",
            angle: 160,
          }
        : { ...DEFAULT_FILL },
  };
}

export function resolveLiveSource(source: LiveSource): LiveSource {
  const style = defaultSourceStyle(source.kind);
  return {
    ...source,
    radius: source.radius ?? style.radius,
    shape: source.shape ?? style.shape,
    opacity: source.opacity ?? style.opacity,
    shadow: { ...style.shadow, ...source.shadow },
    border: { ...style.border, ...source.border },
    maskBorder: source.maskBorder
      ? { ...DEFAULT_BORDER, ...source.maskBorder }
      : source.maskBorder,
    fill: { ...style.fill, ...source.fill },
  };
}

/** Keep the box centered and match width/height to `aspect` (width/height). */
export function fitRectToAspect(rect: LiveRect, aspect: number): LiveRect {
  const ar = aspect > 0.05 && Number.isFinite(aspect) ? aspect : 1;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  let w = rect.w;
  let h = rect.h;
  if (w / Math.max(h, 0.001) > ar) w = h * ar;
  else h = w / ar;
  return clampRect({ x: cx - w / 2, y: cy - h / 2, w, h });
}

/** Uniform size from the larger side, kept centered. */
export function liveRectSize(rect: LiveRect) {
  return Math.max(rect.w, rect.h);
}

/** Pixel aspect of a canvas-normalized rect (1 = square on screen). */
export function liveRectPixelAspect(rect: LiveRect, canvasAspect: number) {
  return (rect.w * Math.max(canvasAspect, 0.05)) / Math.max(rect.h, 0.0001);
}

export function sourceRectMatchesMedia(
  rect: LiveRect,
  mediaAspect: number,
  canvasAspect: number,
) {
  if (!(mediaAspect > 0.05)) return true;
  const got = liveRectPixelAspect(rect, canvasAspect);
  return Math.abs(got - mediaAspect) <= Math.max(0.045, mediaAspect * 0.04);
}

export function liveRectRatioKind(
  rect: LiveRect,
  canvasAspect: number,
): "square" | "rectangle" {
  return Math.abs(liveRectPixelAspect(rect, canvasAspect) - 1) < 0.045
    ? "square"
    : "rectangle";
}

export function scaleLiveRect(rect: LiveRect, size: number): LiveRect {
  const next = Math.min(1, Math.max(MIN_SIZE, size));
  const aspect = rect.w / Math.max(rect.h, 0.0001);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const w = aspect >= 1 ? next : next * aspect;
  const h = aspect >= 1 ? next / aspect : next;
  return fitRectToAspect(
    clampRect({ x: cx - w / 2, y: cy - h / 2, w, h }),
    aspect,
  );
}

export function applyShapePreset(
  rect: LiveRect,
  shape: LiveShape,
  canvasAspect: number,
): { rect: LiveRect; radius?: number } {
  const pixelSquare = 1 / Math.max(canvasAspect, 0.05);
  if (shape === "circle") {
    return { rect: fitRectToAspect(rect, pixelSquare), radius: 0.5 };
  }
  if (shape === "square") {
    return { rect: fitRectToAspect(rect, pixelSquare), radius: 0 };
  }
  if (shape === "rectangle") {
    const insetX = Math.max(0.04, rect.w * 0.12);
    const insetY = Math.max(0.04, rect.h * 0.12);
    return {
      rect: {
        x: rect.x + insetX,
        y: rect.y + insetY,
        w: Math.max(MIN_SIZE, rect.w - insetX * 2),
        h: Math.max(MIN_SIZE, rect.h - insetY * 2),
      },
      radius: 0,
    };
  }
  return { rect };
}

export function newLiveId(prefix: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultRectForKind(
  kind: LiveSourceKind,
  existingCount: number,
): LiveRect {
  if (kind === "text") return { x: 0.06, y: 0.84, w: 0.88, h: 0.12 };
  if (kind === "phone" || (kind === "camera" && existingCount > 0)) {
    return { x: 0.68, y: 0.66, w: 0.28, h: 0.28 };
  }
  return { x: 0, y: 0, w: 1, h: 1 };
}

export function defaultNameForKind(kind: LiveSourceKind, index: number) {
  const names: Record<LiveSourceKind, string> = {
    camera: "Camera",
    screen: "Screen",
    phone: "Phone",
    mic: "Mic",
    system: "System audio",
    image: "Image",
    text: "Text",
    background: "Background",
  };
  return index <= 1 ? names[kind] : `${names[kind]} ${index}`;
}

export function emptyMixerState(): LiveMixerState {
  const sceneId = newLiveId("scene");
  return {
    scenes: [
      {
        id: sceneId,
        name: "Scene 1",
        icon: DEFAULT_SCENE_ICON,
        frameRatio: DEFAULT_FRAME_RATIO,
        sourceIds: [],
      },
    ],
    activeSceneId: sceneId,
    sources: [],
    selectedSourceId: null,
    selectedFocus: "video",
  };
}

export function sourceHasMask(source: Pick<LiveSource, "shape">) {
  return (source.shape ?? "none") !== "none";
}

export function mediaAspectFromSize(
  kind: LiveSourceKind,
  width: number,
  height: number,
) {
  if (width <= 0 || height <= 0) return 1;
  return width / height;
}

export function clampRectInside(inner: LiveRect, outer: LiveRect): LiveRect {
  const w = Math.min(Math.max(MIN_SIZE, inner.w), Math.max(MIN_SIZE, outer.w));
  const h = Math.min(Math.max(MIN_SIZE, inner.h), Math.max(MIN_SIZE, outer.h));
  const x = Math.min(outer.x + outer.w - w, Math.max(outer.x, inner.x));
  const y = Math.min(outer.y + outer.h - h, Math.max(outer.y, inner.y));
  return { x, y, w, h };
}

export function mapMaskWithVideo(
  prev: LiveRect,
  next: LiveRect,
  mask: LiveRect,
): LiveRect {
  const sx = prev.w > 0.0001 ? next.w / prev.w : 1;
  const sy = prev.h > 0.0001 ? next.h / prev.h : 1;
  return clampRectInside(
    {
      x: next.x + (mask.x - prev.x) * sx,
      y: next.y + (mask.y - prev.y) * sy,
      w: mask.w * sx,
      h: mask.h * sy,
    },
    next,
  );
}

export function defaultMaskRect(
  video: LiveRect,
  shape: LiveShape,
  canvasAspect: number,
): LiveRect | undefined {
  if (shape === "none") return undefined;
  return clampRectInside(
    applyShapePreset(video, shape, canvasAspect).rect,
    video,
  );
}

export function resolvedMaskRect(
  source: LiveSource,
  canvasAspect: number,
): LiveRect | null {
  if (!sourceHasMask(source)) return null;
  return (
    source.maskRect ??
    defaultMaskRect(source.rect, source.shape ?? "square", canvasAspect) ??
    null
  );
}

export function sceneIconKey(scene: Pick<LiveScene, "icon">) {
  return scene.icon || DEFAULT_SCENE_ICON;
}

export function sceneFrameRatio(scene?: Pick<LiveScene, "frameRatio"> | null) {
  return normalizeLiveFrameRatio(scene?.frameRatio);
}

export function canvasAspectForState(state: LiveMixerState): number {
  const scene = state.scenes.find((row) => row.id === state.activeSceneId);
  return liveCanvasSize(sceneFrameRatio(scene)).ar;
}

/** Video box w/h in canvas-normalized space. */
export function videoNormalizedAspect(
  mediaAspect: number | undefined,
  canvasAspect: number,
): number | null {
  if (!mediaAspect || mediaAspect <= 0) return null;
  return mediaAspect / Math.max(canvasAspect, 0.05);
}

/** Mask box w/h. Circle stays a pixel square; square and rectangle are free. */
export function maskNormalizedAspect(
  shape: LiveShape | undefined,
  canvasAspect: number,
): number | null {
  if (shape === "circle") return 1 / Math.max(canvasAspect, 0.05);
  return null;
}

/** After a handle drag, keep the opposite edges and lock w/h to `aspect`. */
export function lockRectToAspect(
  prev: LiveRect,
  next: LiveRect,
  handle: LiveHandle,
  aspect: number,
): LiveRect {
  if (handle === "move") return clampRect(next);
  const ar = aspect > 0.05 && Number.isFinite(aspect) ? aspect : 1;
  let w = next.w;
  let h = next.h;
  if (handle.length === 2) {
    const dw = Math.abs(next.w - prev.w);
    const dh = Math.abs(next.h - prev.h);
    if (dw >= dh) h = w / ar;
    else w = h * ar;
  } else if (handle === "e" || handle === "w") {
    h = w / ar;
  } else {
    w = h * ar;
  }
  let x = prev.x;
  let y = prev.y;
  if (handle === "e" || handle === "ne" || handle === "se") x = prev.x;
  if (handle === "w" || handle === "nw" || handle === "sw") {
    x = prev.x + prev.w - w;
  }
  if (handle === "s" || handle === "se" || handle === "sw") y = prev.y;
  if (handle === "n" || handle === "ne" || handle === "nw") {
    y = prev.y + prev.h - h;
  }
  if (handle === "n" || handle === "s") x = prev.x;
  if (handle === "e" || handle === "w") y = prev.y;
  return clampRect({ x, y, w, h });
}

export type LiveSnapGuides = { x: number | null; y: number | null };

const SNAP_THRESHOLD = 0.025;

function closestSnap(
  candidates: Array<{ delta: number; guide: number }>,
  threshold: number,
): { delta: number; guide: number } | null {
  let best: { delta: number; guide: number } | null = null;
  for (const candidate of candidates) {
    if (Math.abs(candidate.delta) > threshold) continue;
    if (!best || Math.abs(candidate.delta) < Math.abs(best.delta)) best = candidate;
  }
  return best;
}

function rectAnchors(rect: LiveRect) {
  return {
    left: rect.x,
    cx: rect.x + rect.w / 2,
    right: rect.x + rect.w,
    top: rect.y,
    cy: rect.y + rect.h / 2,
    bottom: rect.y + rect.h,
  };
}

/** Magnet to canvas edges/center and matching edges on other sources, like the editor canvas. */
export function snapLiveRect(
  rect: LiveRect,
  handle: LiveHandle,
  others: LiveRect[] = [],
  threshold = SNAP_THRESHOLD,
): { rect: LiveRect; guides: LiveSnapGuides } {
  const otherX = others.map((row) => rectAnchors(row));
  const otherY = otherX;
  const self = rectAnchors(rect);
  const xCandidates: Array<{ delta: number; guide: number }> = [];
  const yCandidates: Array<{ delta: number; guide: number }> = [];
  const add = (
    list: Array<{ delta: number; guide: number }>,
    value: number,
    guides: number[],
  ) => {
    for (const guide of guides) list.push({ delta: guide - value, guide });
  };
  const xLeft = [0, ...otherX.map((row) => row.left)];
  const xCenter = [0.5, ...otherX.map((row) => row.cx)];
  const xRight = [1, ...otherX.map((row) => row.right)];
  const yTop = [0, ...otherY.map((row) => row.top)];
  const yCenter = [0.5, ...otherY.map((row) => row.cy)];
  const yBottom = [1, ...otherY.map((row) => row.bottom)];
  if (handle === "move") {
    add(xCandidates, self.left, xLeft);
    add(xCandidates, self.cx, xCenter);
    add(xCandidates, self.right, xRight);
    add(yCandidates, self.top, yTop);
    add(yCandidates, self.cy, yCenter);
    add(yCandidates, self.bottom, yBottom);
  } else {
    if (handle === "e" || handle === "ne" || handle === "se") add(xCandidates, self.right, xRight);
    if (handle === "w" || handle === "nw" || handle === "sw") add(xCandidates, self.left, xLeft);
    if (handle === "n" || handle === "ne" || handle === "nw") add(yCandidates, self.top, yTop);
    if (handle === "s" || handle === "se" || handle === "sw") add(yCandidates, self.bottom, yBottom);
  }
  const snapX = closestSnap(xCandidates, threshold);
  const snapY = closestSnap(yCandidates, threshold);
  const dx = snapX?.delta ?? 0;
  const dy = snapY?.delta ?? 0;
  const next = { ...rect };
  if (handle === "move") {
    next.x += dx;
    next.y += dy;
  } else {
    if (handle === "e" || handle === "ne" || handle === "se") next.w += dx;
    if (handle === "w" || handle === "nw" || handle === "sw") {
      next.x += dx;
      next.w -= dx;
    }
    if (handle === "s" || handle === "se" || handle === "sw") next.h += dy;
    if (handle === "n" || handle === "ne" || handle === "nw") {
      next.y += dy;
      next.h -= dy;
    }
  }
  return {
    rect: clampRect(next),
    guides: { x: snapX?.guide ?? null, y: snapY?.guide ?? null },
  };
}

export function clampRect(rect: LiveRect): LiveRect {
  const w = Math.min(1.5, Math.max(MIN_SIZE, rect.w));
  const h = Math.min(1.5, Math.max(MIN_SIZE, rect.h));
  return {
    x: Math.min(1 - MIN_SIZE, Math.max(-0.4, rect.x)),
    y: Math.min(1 - MIN_SIZE, Math.max(-0.4, rect.y)),
    w,
    h,
  };
}

export type LiveEdgeSide = "left" | "right" | "top" | "bottom";

export type LiveEdgeGaps = Record<LiveEdgeSide, number>;

/** Arrow-key nudge in preview pixels. Shift uses the larger step. */
export const LIVE_NUDGE_PX = 1;
export const LIVE_NUDGE_SHIFT_PX = 10;
/** Show an edge gap when it is within this fraction of the canvas. */
export const LIVE_EDGE_NEAR = 0.06;

export function nudgeLiveRect(rect: LiveRect, dx: number, dy: number): LiveRect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy });
}

export function liveRectCanvasGaps(rect: LiveRect): LiveEdgeGaps {
  return {
    left: Math.max(0, rect.x),
    right: Math.max(0, 1 - (rect.x + rect.w)),
    top: Math.max(0, rect.y),
    bottom: Math.max(0, 1 - (rect.y + rect.h)),
  };
}

export function nearLiveEdgeSides(
  gaps: LiveEdgeGaps,
  threshold = LIVE_EDGE_NEAR,
): LiveEdgeSide[] {
  const fullW = gaps.left + gaps.right <= 0.02;
  const fullH = gaps.top + gaps.bottom <= 0.02;
  return (["left", "right", "top", "bottom"] as const).filter((side) => {
    if (gaps[side] > threshold) return false;
    if (fullW && (side === "left" || side === "right")) return false;
    if (fullH && (side === "top" || side === "bottom")) return false;
    return true;
  });
}

export function activeSources(state: LiveMixerState): LiveSource[] {
  const scene = state.scenes.find((row) => row.id === state.activeSceneId);
  if (!scene) return [];
  return scene.sourceIds
    .map((id) => state.sources.find((source) => source.id === id))
    .filter((row): row is LiveSource => Boolean(row));
}

export function addSourceToMixer(
  state: LiveMixerState,
  source: Omit<LiveSource, "id" | "rect" | "visible"> & {
    id?: string;
    rect?: LiveRect;
    visible?: boolean;
    deviceId?: string;
    sessionId?: string;
  },
  place: "front" | "back" = "front",
): LiveMixerState {
  const kindCount =
    state.sources.filter((row) => row.kind === source.kind).length + 1;
  const scene = state.scenes.find((row) => row.id === state.activeSceneId);
  const currentIds = scene?.sourceIds ?? [];
  const hasFullBackground = currentIds.some((id) => {
    const row = state.sources.find((item) => item.id === id);
    return Boolean(row && row.rect.w >= 0.9 && row.rect.h >= 0.9);
  });
  const style = defaultSourceStyle(source.kind);
  const pipOverFull =
    hasFullBackground &&
    (source.kind === "camera" || source.kind === "phone");
  const rawRect = clampRect(
    source.rect ??
      defaultRectForKind(source.kind, pipOverFull ? 1 : kindCount - 1),
  );
  const shape = source.shape ?? style.shape;
  const next: LiveSource = {
    id: source.id ?? newLiveId(source.kind),
    kind: source.kind,
    name: source.name || defaultNameForKind(source.kind, kindCount),
    visible: source.visible ?? true,
    rect: rawRect,
    radius: source.radius ?? style.radius,
    shape,
    opacity: source.opacity ?? style.opacity,
    shadow: { ...style.shadow, ...source.shadow },
    border: { ...style.border, ...source.border },
    maskBorder: source.maskBorder,
    fill: { ...style.fill, ...source.fill },
    text: source.text,
    imageUrl: source.imageUrl,
    deviceId: source.deviceId,
    sessionId: source.sessionId,
    cameraDeviceId: source.cameraDeviceId,
    cameraLabel: source.cameraLabel,
    facing: source.facing,
    torch: source.torch,
    mirror: source.mirror,
    zoom: source.zoom ?? 1,
    zoomMin: source.zoomMin,
    zoomMax: source.zoomMax,
    zoomHardware: source.zoomHardware,
    volume: source.volume ?? 1,
    muted: source.muted ?? false,
    mediaAspect: source.mediaAspect,
    maskRect: source.maskRect,
    deviceKey: source.deviceKey,
    remembered: source.remembered ?? (source.kind === "phone" || source.kind === "camera"),
    offline: source.offline ?? false,
  };
  const sourceIds =
    place === "back" ? [next.id, ...currentIds] : [...currentIds, next.id];
  let sources = [...state.sources, next];
  if (place === "back" && next.rect.w >= 0.9 && next.rect.h >= 0.9) {
    sources = sources.map((row) => {
      if (row.id === next.id) return row;
      if (
        (row.kind === "camera" || row.kind === "phone") &&
        row.rect.w >= 0.9 &&
        row.rect.h >= 0.9
      ) {
        return { ...row, rect: defaultRectForKind("phone", 1) };
      }
      return row;
    });
  }
  return {
    ...state,
    sources,
    scenes: state.scenes.map((row) =>
      row.id === state.activeSceneId ? { ...row, sourceIds } : row,
    ),
    selectedSourceId: next.id,
    selectedFocus: "video",
  };
}

export function removeSourceFromMixer(
  state: LiveMixerState,
  sourceId: string,
): LiveMixerState {
  return {
    ...state,
    sources: state.sources.filter((row) => row.id !== sourceId),
    scenes: state.scenes.map((scene) => ({
      ...scene,
      sourceIds: scene.sourceIds.filter((id) => id !== sourceId),
    })),
    selectedSourceId:
      state.selectedSourceId === sourceId ? null : state.selectedSourceId,
    selectedFocus:
      state.selectedSourceId === sourceId ? "video" : state.selectedFocus,
  };
}

export function patchSource(
  state: LiveMixerState,
  sourceId: string,
  patch: Partial<Omit<LiveSource, "id" | "kind">>,
): LiveMixerState {
  const canvasAspect = canvasAspectForState(state);
  return {
    ...state,
    sources: state.sources.map((row) => {
      if (row.id !== sourceId) return row;
      const next = {
        ...row,
        ...patch,
        rect: patch.rect ? clampRect(patch.rect) : row.rect,
        shadow: patch.shadow ? { ...row.shadow, ...patch.shadow } : row.shadow,
        fill: patch.fill ? { ...row.fill, ...patch.fill } : row.fill,
      };
      if (patch.rect) {
        const prevRect = row.rect;
        if (sourceHasMask(next) && (patch.maskRect ?? row.maskRect)) {
          let mask = mapMaskWithVideo(
            prevRect,
            next.rect,
            patch.maskRect ?? row.maskRect!,
          );
          const maskAr = maskNormalizedAspect(next.shape, canvasAspect);
          if (maskAr) {
            mask = clampRectInside(fitRectToAspect(mask, maskAr), next.rect);
          }
          next.maskRect = mask;
        }
      }
      if (
        patch.shape &&
        patch.maskRect == null &&
        patch.shape !== (row.shape ?? "none")
      ) {
        if (patch.shape === "none") {
          next.maskRect = undefined;
          if ((row.shape ?? "none") === "circle" || (row.radius ?? 0) >= 0.49) {
            next.radius = 0;
          }
          const mediaAspect = next.mediaAspect ?? row.mediaAspect;
          if (mediaAspect) {
            const fitted = fitRectToAspect(
              next.rect,
              mediaAspect / Math.max(canvasAspect, 0.05),
            );
            next.rect = fitted;
          }
        } else {
          next.maskRect = defaultMaskRect(next.rect, patch.shape, canvasAspect);
          if (patch.radius == null) {
            next.radius = applyShapePreset(
              next.rect,
              patch.shape,
              canvasAspect,
            ).radius;
          }
        }
      }
      if (patch.maskRect && sourceHasMask(next)) {
        let mask = clampRectInside(clampRect(patch.maskRect), next.rect);
        const maskAr = maskNormalizedAspect(next.shape, canvasAspect);
        if (maskAr) mask = clampRectInside(fitRectToAspect(mask, maskAr), next.rect);
        next.maskRect = mask;
      }
      if (patch.mediaAspect && Number.isFinite(patch.mediaAspect)) {
        const targetAr = patch.mediaAspect / Math.max(canvasAspect, 0.05);
        const aspectChanged =
          Math.abs((row.mediaAspect ?? 0) - patch.mediaAspect) > 0.02;
        const ratioOff = !sourceRectMatchesMedia(
          next.rect,
          patch.mediaAspect,
          canvasAspect,
        );
        if (aspectChanged || ratioOff) {
          const fitted = fitRectToAspect(next.rect, targetAr);
          if (next.maskRect) {
            next.maskRect = mapMaskWithVideo(next.rect, fitted, next.maskRect);
          }
          next.rect = fitted;
        }
      }
      return next;
    }),
  };
}

export function applyShapeToSource(
  state: LiveMixerState,
  sourceId: string,
  shape: LiveShape,
): LiveMixerState {
  return patchSource(state, sourceId, { shape });
}

export function addScene(state: LiveMixerState): LiveMixerState {
  const n = state.scenes.length + 1;
  const scene: LiveScene = {
    id: newLiveId("scene"),
    name: `Scene ${n}`,
    icon: DEFAULT_SCENE_ICON,
    frameRatio: DEFAULT_FRAME_RATIO,
    sourceIds: [],
  };
  return {
    ...state,
    scenes: [...state.scenes, scene],
    activeSceneId: scene.id,
    selectedSourceId: null,
    selectedFocus: "video",
  };
}

function canvasPixelsFromAspect(ar: number) {
  const match = LIVE_FRAME_PRESETS.find(
    (preset) => Math.abs(preset.w / preset.h - ar) < 0.03,
  );
  if (match) return { w: match.w, h: match.h };
  return { w: Math.max(1, Math.round(1080 * ar)), h: 1080 };
}

/** Map a 0–1 box from one canvas ratio to another without compounding shrink. */
export function remapRectToCanvas(
  rect: LiveRect,
  prevAspect: number,
  nextAspect: number,
  pixelAspect?: number | null,
): LiveRect {
  if (!(nextAspect > 0) || Math.abs(prevAspect - nextAspect) < 0.01) {
    return clampRect(rect);
  }
  const prev = canvasPixelsFromAspect(prevAspect);
  const next = canvasPixelsFromAspect(nextAspect);
  let pw = Math.max(1, rect.w * prev.w);
  let ph = Math.max(1, rect.h * prev.h);
  const cx = (rect.x + rect.w / 2) * prev.w;
  const cy = (rect.y + rect.h / 2) * prev.h;
  const wantAr =
    pixelAspect && pixelAspect > 0.05 ? pixelAspect : pw / Math.max(ph, 0.0001);
  if (pw / ph > wantAr) ph = pw / wantAr;
  else pw = ph * wantAr;
  const fillsAxis = rect.w >= 0.9 || rect.h >= 0.9;
  const fit = Math.min(next.w / pw, next.h / ph);
  const keep = Math.min(next.w, next.h) / Math.min(prev.w, prev.h);
  const scale = fillsAxis ? fit : Math.min(keep, fit);
  pw *= scale;
  ph *= scale;
  const ncx = (cx / prev.w) * next.w;
  const ncy = (cy / prev.h) * next.h;
  return clampRect({
    x: (ncx - pw / 2) / next.w,
    y: (ncy - ph / 2) / next.h,
    w: pw / next.w,
    h: ph / next.h,
  });
}

export function remapMixerToCanvasAspect(
  state: LiveMixerState,
  prevAspect: number,
  nextAspect: number,
): LiveMixerState {
  if (!(nextAspect > 0) || Math.abs(prevAspect - nextAspect) < 0.01) return state;
  return {
    ...state,
    sources: state.sources.map((source) => {
      if (isAudioOnlyKind(source.kind)) return source;
      if (
        !source.mediaAspect &&
        source.rect.w >= 0.95 &&
        source.rect.h >= 0.95
      ) {
        return { ...source, rect: { x: 0, y: 0, w: 1, h: 1 } };
      }
      const fitted = remapRectToCanvas(
        source.rect,
        prevAspect,
        nextAspect,
        source.mediaAspect,
      );
      let maskRect = source.maskRect;
      if (maskRect) {
        maskRect = mapMaskWithVideo(source.rect, fitted, maskRect);
        const maskAr = maskNormalizedAspect(source.shape, nextAspect);
        if (maskAr) {
          maskRect = clampRectInside(fitRectToAspect(maskRect, maskAr), fitted);
        }
      }
      return { ...source, rect: fitted, maskRect };
    }),
  };
}

export function patchScene(
  state: LiveMixerState,
  sceneId: string,
  patch: Partial<Pick<LiveScene, "name" | "icon" | "frameRatio">>,
): LiveMixerState {
  const prevAspect = canvasAspectForState(state);
  const next: LiveMixerState = {
    ...state,
    scenes: state.scenes.map((row) =>
      row.id === sceneId ? { ...row, ...patch } : row,
    ),
  };
  if (patch.frameRatio == null) return next;
  return remapMixerToCanvasAspect(next, prevAspect, canvasAspectForState(next));
}

export function removeScene(
  state: LiveMixerState,
  sceneId: string,
): LiveMixerState {
  if (state.scenes.length <= 1) return state;
  const index = state.scenes.findIndex((row) => row.id === sceneId);
  if (index < 0) return state;
  const scenes = state.scenes.filter((row) => row.id !== sceneId);
  const keptIds = new Set(scenes.flatMap((row) => row.sourceIds));
  const sources = state.sources.filter((row) => keptIds.has(row.id));
  const fallback = scenes[Math.min(index, scenes.length - 1)];
  const activeSceneId =
    state.activeSceneId === sceneId
      ? (fallback?.id ?? scenes[0]!.id)
      : state.activeSceneId;
  const selectedStillThere = sources.some(
    (row) => row.id === state.selectedSourceId,
  );
  return {
    ...state,
    scenes,
    sources,
    activeSceneId,
    selectedSourceId: selectedStillThere ? state.selectedSourceId : null,
  };
}

/** `from` / `to` are display indexes (front of stack = 0, top of the list). */
export function reorderDisplayedSources(
  state: LiveMixerState,
  from: number,
  to: number,
): LiveMixerState {
  const scene = state.scenes.find((row) => row.id === state.activeSceneId);
  if (!scene) return state;
  const display = [...scene.sourceIds].reverse();
  if (
    from < 0 ||
    to < 0 ||
    from >= display.length ||
    to >= display.length ||
    from === to
  ) {
    return state;
  }
  const [moved] = display.splice(from, 1);
  if (!moved) return state;
  display.splice(to, 0, moved);
  return {
    ...state,
    scenes: state.scenes.map((row) =>
      row.id === state.activeSceneId
        ? { ...row, sourceIds: [...display].reverse() }
        : row,
    ),
  };
}

export function displayedSourceIds(state: LiveMixerState): string[] {
  const scene = state.scenes.find((row) => row.id === state.activeSceneId);
  return scene ? [...scene.sourceIds].reverse() : [];
}

export function applyHandle(
  rect: LiveRect,
  handle: LiveHandle,
  dx: number,
  dy: number,
): LiveRect {
  const next = { ...rect };
  if (handle === "move" || handle === "w" || handle === "nw" || handle === "sw") {
    next.x += dx;
  }
  if (handle === "move" || handle === "n" || handle === "nw" || handle === "ne") {
    next.y += dy;
  }
  if (handle === "e" || handle === "ne" || handle === "se") next.w += dx;
  if (handle === "w" || handle === "nw" || handle === "sw") next.w -= dx;
  if (handle === "s" || handle === "se" || handle === "sw") next.h += dy;
  if (handle === "n" || handle === "ne" || handle === "nw") next.h -= dy;
  return clampRect(next);
}

function handleHits(
  rect: LiveRect,
  px: number,
  py: number,
  canvasW: number,
  canvasH: number,
): LiveHandle | null {
  const x = rect.x * canvasW;
  const y = rect.y * canvasH;
  const w = rect.w * canvasW;
  const h = rect.h * canvasH;
  const hitPad = Math.max(22, Math.min(canvasW, canvasH) * 0.02);
  const near = (ax: number, ay: number) =>
    Math.abs(px - ax) <= hitPad && Math.abs(py - ay) <= hitPad;
  if (near(x, y)) return "nw";
  if (near(x + w, y)) return "ne";
  if (near(x, y + h)) return "sw";
  if (near(x + w, y + h)) return "se";
  if (near(x + w / 2, y)) return "n";
  if (near(x + w / 2, y + h)) return "s";
  if (near(x, y + h / 2)) return "w";
  if (near(x + w, y + h / 2)) return "e";
  if (px >= x && px <= x + w && py >= y && py <= y + h) return "move";
  return null;
}

export function hitRectHandle(
  rect: LiveRect,
  px: number,
  py: number,
  canvasW: number,
  canvasH: number,
): LiveHandle | null {
  return handleHits(rect, px, py, canvasW, canvasH);
}

export function sourceHitRect(
  source: LiveSource,
  canvasAspect: number,
  mode: "full" | "visible" = "full",
): LiveRect {
  if (mode === "visible" && sourceHasMask(source)) {
    return resolvedMaskRect(source, canvasAspect) ?? source.rect;
  }
  return source.rect;
}

export function hitMixerSource(
  sources: LiveSource[],
  px: number,
  py: number,
  canvasW: number,
  canvasH: number,
  opts?: { canvasAspect?: number; hitMode?: "full" | "visible" },
): { sourceId: string; handle: LiveHandle } | null {
  const canvasAspect = opts?.canvasAspect ?? canvasW / Math.max(canvasH, 1);
  const hitMode = opts?.hitMode ?? "full";
  for (let i = sources.length - 1; i >= 0; i -= 1) {
    const source = sources[i];
    if (!source?.visible || isAudioOnlyKind(source.kind)) continue;
    const rect = sourceHitRect(source, canvasAspect, hitMode);
    const handle = handleHits(rect, px, py, canvasW, canvasH);
    if (handle) return { sourceId: source.id, handle };
  }
  return null;
}

export function cursorForHandle(handle: LiveHandle | null) {
  if (!handle) return "default";
  if (handle === "move") return "move";
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  return "nwse-resize";
}
