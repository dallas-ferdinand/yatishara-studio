import type { TransitionType } from "../types";

export type CompositorFrame = {
  frame?: VideoFrame;
};

type CompositorLayer = {
  frame?: VideoFrame;
  textureKey?: string;
  transform?: [number, number, number, number];
  opacity?: number;
  width?: number;
  height?: number;
};

function closeLayerFrames(layers: CompositorLayer[] | undefined): void {
  for (const layer of layers ?? []) {
    try {
      layer.frame?.close();
    } catch {
      /* already closed */
    }
  }
}

/** postMessage cannot transfer the same VideoFrame twice. */
function uniqueLayerFrames(layers: CompositorLayer[]): {
  layers: CompositorLayer[];
  transfer: Transferable[];
} {
  const seen = new Set<VideoFrame>();
  const transfer: Transferable[] = [];
  const unique = layers.map((layer) => {
    let frame = layer.frame;
    if (frame && seen.has(frame)) frame = frame.clone();
    if (frame) {
      seen.add(frame);
      transfer.push(frame);
    }
    return { ...layer, frame };
  });
  return { layers: unique, transfer };
}

export class CompositorClient {
  private readonly worker: Worker;
  private requestId = 0;
  private readonly pending = new Map<
    number,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  private ready: Promise<void>;
  private disposed = false;
  private ensuredFonts = new Set<string>();
  /** Play-path: drop overlapping paints instead of queuing. */
  private paintBusy = false;
  /**
   * Still keys the worker could not bind — it evicted them, or never received
   * pixels for them. Senders that cache "already uploaded" must forget these
   * or the lane stays invisible for the rest of the session.
   */
  onTextureMiss: ((textureKeys: string[]) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    if (!("transferControlToOffscreen" in canvas)) {
      throw new Error("OffscreenCanvas transfer is unavailable.");
    }
    const offscreen = canvas.transferControlToOffscreen();
    this.worker = new Worker(new URL("./compositor.worker.ts", import.meta.url), {
      name: "studio-gpu-compositor",
    });
    this.ready = new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };
      const onMessage = (event: MessageEvent) => {
        if (event.data?.type === "ready") {
          settle(() => resolve());
          return;
        }
        if (event.data?.type === "error" && event.data?.requestId == null) {
          settle(() =>
            reject(new Error(event.data.error ?? "Compositor initialization failed.")),
          );
          return;
        }
        const requestId = event.data?.requestId;
        if (typeof requestId !== "number") return;
        const missing = event.data?.missingTextures;
        if (Array.isArray(missing) && missing.length) this.onTextureMiss?.(missing);
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        if (event.data.type === "error") {
          pending.reject(new Error(event.data.error ?? "Compositor render failed."));
        } else {
          pending.resolve();
        }
      };
      this.worker.addEventListener("message", onMessage);
      this.worker.addEventListener("error", (event) => {
        settle(() =>
          reject(
            new Error(
              event.message ||
                "Compositor worker failed to load. Hard-refresh if this persists after a deploy.",
            ),
          ),
        );
      });
    });
    this.worker.postMessage(
      { type: "init", canvas: offscreen, width, height },
      [offscreen],
    );
  }

  async render(args: {
    frameA?: VideoFrame;
    frameB?: VideoFrame;
    /** Stable key → skip GPU re-upload when pixels unchanged (PNG stills). */
    textureKeyA?: string;
    textureKeyB?: string;
    transformA?: [number, number, number, number];
    transformB?: [number, number, number, number];
    opacityA?: number;
    opacityB?: number;
    transition?: TransitionType;
    progress?: number;
    background?: [number, number, number, number];
    textsUnder?: Array<{
      text: string;
      fontSize: number;
      color: string;
      align: "left" | "center" | "right";
      opacity: number;
      translateY: number;
      scale: number;
      fontFamily: string;
      bold: boolean;
      italic: boolean;
      strokeColor: string;
      strokeWidth: number;
      flipX: boolean;
      flipY: boolean;
      poseX: number;
      poseY: number;
      poseScale: number;
      rotation: number;
      clipId?: string;
      underline?: boolean;
      textCase?: "none" | "upper" | "lower" | "title";
      letterSpacing?: number;
      lineHeight?: number;
      verticalAlign?: "top" | "middle" | "bottom";
      backgroundColor?: string | null;
      backgroundPadding?: number;
      backgroundRadius?: number;
      shadowColor?: string | null;
      shadowBlur?: number;
      shadowOffsetX?: number;
      shadowOffsetY?: number;
      glow?: boolean;
      glowColor?: string;
      glowBlur?: number;
    }>;
    textsOver?: Array<{
      text: string;
      fontSize: number;
      color: string;
      align: "left" | "center" | "right";
      opacity: number;
      translateY: number;
      scale: number;
      fontFamily: string;
      bold: boolean;
      italic: boolean;
      strokeColor: string;
      strokeWidth: number;
      flipX: boolean;
      flipY: boolean;
      poseX: number;
      poseY: number;
      poseScale: number;
      rotation: number;
      clipId?: string;
      underline?: boolean;
      textCase?: "none" | "upper" | "lower" | "title";
      letterSpacing?: number;
      lineHeight?: number;
      verticalAlign?: "top" | "middle" | "bottom";
      backgroundColor?: string | null;
      backgroundPadding?: number;
      backgroundRadius?: number;
      shadowColor?: string | null;
      shadowBlur?: number;
      shadowOffsetX?: number;
      shadowOffsetY?: number;
      glow?: boolean;
      glowColor?: string;
      glowBlur?: number;
    }>;
    stack?: Array<{
      frame?: VideoFrame;
      textureKey?: string;
      transform?: [number, number, number, number];
      opacity?: number;
      width?: number;
      height?: number;
    }>;
    /** Bottom → top picture stack. Preferred over frameA/frameB/stack. */
    layers?: Array<{
      frame?: VideoFrame;
      textureKey?: string;
      transform?: [number, number, number, number];
      opacity?: number;
      width?: number;
      height?: number;
    }>;
  }): Promise<void> {
    if (this.disposed) {
      args.frameA?.close();
      args.frameB?.close();
      closeLayerFrames(args.stack);
      closeLayerFrames(args.layers);
      return;
    }
    await this.ready;
    const requestId = ++this.requestId;
    const packed = uniqueLayerFrames(args.layers ?? []);
    const frameA = args.frameA;
    let frameB = args.frameB;
    const stack = args.stack ?? [];
    if (frameA && frameB && frameA === frameB) {
      frameB = frameA.clone();
    }
    const transfer: Transferable[] = [...packed.transfer];
    if (frameA) transfer.push(frameA);
    if (frameB) transfer.push(frameB);
    for (const layer of stack) {
      if (layer.frame) transfer.push(layer.frame);
    }
    return await new Promise<void>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage(
        {
          type: "render",
          requestId,
          frameA,
          frameB,
          textureKeyA: args.textureKeyA,
          textureKeyB: args.textureKeyB,
          transformA: args.transformA ?? [1, 0, 0, 0],
          transformB: args.transformB ?? [1, 0, 0, 0],
          opacityA: args.opacityA ?? 1,
          opacityB: args.opacityB ?? 1,
          stack,
          layers: packed.layers,
          transition: args.transition ?? "none",
          progress: args.progress ?? 0,
          background: args.background ?? [0, 0, 0, 1],
          textsUnder: args.textsUnder ?? [],
          textsOver: args.textsOver ?? [],
        },
        transfer,
      );
    });
  }

  /**
   * Live play: post render and return immediately. If a paint is already in
   * flight, drop this one (close frames) so the clock never waits on GPU.
   * @returns false when dropped
   */
  paint(
    args: Parameters<CompositorClient["render"]>[0],
  ): boolean {
    if (this.disposed) {
      args.frameA?.close();
      args.frameB?.close();
      closeLayerFrames(args.stack);
      closeLayerFrames(args.layers);
      return false;
    }
    if (this.paintBusy) {
      args.frameA?.close();
      args.frameB?.close();
      closeLayerFrames(args.stack);
      closeLayerFrames(args.layers);
      return false;
    }
    this.paintBusy = true;
    const requestId = ++this.requestId;
    const packed = uniqueLayerFrames(args.layers ?? []);
    const frameA = args.frameA;
    let frameB = args.frameB;
    const stack = args.stack ?? [];
    if (frameA && frameB && frameA === frameB) {
      frameB = frameA.clone();
    }
    const transfer: Transferable[] = [...packed.transfer];
    if (frameA) transfer.push(frameA);
    if (frameB) transfer.push(frameB);
    for (const layer of stack) {
      if (layer.frame) transfer.push(layer.frame);
    }
    const finish = () => {
      this.paintBusy = false;
    };
    void this.ready
      .then(() => {
        if (this.disposed) {
          frameA?.close();
          frameB?.close();
          closeLayerFrames(stack);
          closeLayerFrames(packed.layers);
          finish();
          return;
        }
        return new Promise<void>((resolve, reject) => {
          this.pending.set(requestId, {
            resolve: () => {
              finish();
              resolve();
            },
            reject: (error) => {
              finish();
              reject(error);
            },
          });
          this.worker.postMessage(
            {
              type: "render",
              requestId,
              frameA,
              frameB,
              textureKeyA: args.textureKeyA,
              textureKeyB: args.textureKeyB,
              transformA: args.transformA ?? [1, 0, 0, 0],
              transformB: args.transformB ?? [1, 0, 0, 0],
              opacityA: args.opacityA ?? 1,
              opacityB: args.opacityB ?? 1,
              stack,
              layers: packed.layers,
              transition: args.transition ?? "none",
              progress: args.progress ?? 0,
              background: args.background ?? [0, 0, 0, 1],
              textsUnder: args.textsUnder ?? [],
              textsOver: args.textsOver ?? [],
            },
            transfer,
          );
        });
      })
      .catch(() => {
        finish();
      });
    return true;
  }

  updateTransform(
    transform: [number, number, number, number],
    target: "a" | "b" = "a",
  ): void {
    if (this.disposed) return;
    // Transform-only redraws are tiny (no decode or texture upload). Send the
    // pointer's latest transform immediately; adding a main-thread rAF here
    // made the pixels trail the selection overlay by an extra frame.
    void this.ready.then(() => {
      if (!this.disposed) {
        this.worker.postMessage({
          type: "transform",
          target,
          transformA: transform,
        });
      }
    });
  }

  /** Live text pose while dragging — mirrors updateTransform for video. */
  updateTextTransform(
    clipId: string,
    transform: [number, number, number, number],
  ): void {
    if (this.disposed) return;
    void this.ready.then(() => {
      if (!this.disposed) {
        this.worker.postMessage({
          type: "textTransform",
          clipId,
          transform,
        });
      }
    });
  }


  async ensureFonts(families: string[]): Promise<void> {
    if (this.disposed) return;
    const unique = [
      ...new Set(
        families
          .map((family) => family.trim())
          .filter((family) => family && !this.ensuredFonts.has(family)),
      ),
    ];
    if (unique.length === 0) return;
    await this.ready;
    const requestId = ++this.requestId;
    await new Promise<void>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({
        type: "ensureFonts",
        requestId,
        families: unique,
      });
    });
    if (this.disposed) return;
    for (const family of unique) this.ensuredFonts.add(family);
  }

  resize(width: number, height: number): void {
    if (!this.disposed) {
      this.worker.postMessage({
        type: "resize",
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
      });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.postMessage({ type: "dispose" });
    this.worker.terminate();
    const error = new Error("Compositor was disposed.");
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
