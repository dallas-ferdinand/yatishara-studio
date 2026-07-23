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
    }>;
    textsOver?: Array<{
      text: string;
      fontSize: number;
      color: string;
      align: "left" | "center" | "right";
      opacity: number;
      translateY: number;
      scale: number;
    }>;
  }): Promise<void> {
    if (this.disposed) {
      args.frameA?.close();
      args.frameB?.close();
      return;
    }
    await this.ready;
    const requestId = ++this.requestId;
    const transfer: Transferable[] = [];
    if (args.frameA) transfer.push(args.frameA);
    if (args.frameB) transfer.push(args.frameB);
    return await new Promise<void>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage(
        {
          type: "render",
          requestId,
          frameA: args.frameA,
          frameB: args.frameB,
          transformA: args.transformA ?? [1, 0, 0, 0],
          transformB: args.transformB ?? [1, 0, 0, 0],
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

  updateTransform(transform: [number, number, number, number]): void {
    if (this.disposed) return;
    // Transform-only redraws are tiny (no decode or texture upload). Send the
    // pointer's latest transform immediately; adding a main-thread rAF here
    // made the pixels trail the selection overlay by an extra frame.
    void this.ready.then(() => {
      if (!this.disposed) {
        this.worker.postMessage({ type: "transform", transformA: transform });
      }
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
