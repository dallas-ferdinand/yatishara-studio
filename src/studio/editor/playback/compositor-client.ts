import type { TransitionType } from "../types";

export type CompositorFrame = {
  frame?: VideoFrame;
};

export class CompositorClient {
  private readonly worker: Worker;
  private requestId = 0;
  private readonly pending = new Map<
    number,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  private ready: Promise<void>;
  private disposed = false;

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
  }): Promise<void> {
    if (this.disposed) {
      args.frameA?.close();
      args.frameB?.close();
      return;
    }
    await this.ready;
    const requestId = ++this.requestId;
    const frameA = args.frameA;
    let frameB = args.frameB;
    // postMessage transfer list cannot contain the same VideoFrame twice.
    if (frameA && frameB && frameA === frameB) {
      frameB = frameA.clone();
    }
    const transfer: Transferable[] = [];
    if (frameA) transfer.push(frameA);
    if (frameB) transfer.push(frameB);
    return await new Promise<void>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage(
        {
          type: "render",
          requestId,
          frameA,
          frameB,
          transformA: args.transformA ?? [1, 0, 0, 0],
          transformB: args.transformB ?? [1, 0, 0, 0],
          opacityA: args.opacityA ?? 1,
          opacityB: args.opacityB ?? 1,
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
    const unique = [...new Set(families.map((f) => f.trim()).filter(Boolean))];
    if (unique.length === 0) return;
    await this.ready;
    const requestId = ++this.requestId;
    return await new Promise<void>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({
        type: "ensureFonts",
        requestId,
        families: unique,
      });
    });
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
