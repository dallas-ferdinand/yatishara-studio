import type { TransitionType } from "../types";
import {
  Canvas2dCompositor,
  type CompositorLayer,
  type CompositorPaintArgs,
  type CompositorTextItem,
} from "./compositor-2d";

function closeLayerFrames(layers: CompositorLayer[] | undefined): void {
  for (const layer of layers ?? []) {
    try {
      layer.frame?.close();
    } catch {
      /* already closed */
    }
  }
}

export type CompositorFrame = {
  frame?: VideoFrame;
};

export class CompositorClient {
  private readonly compositor: Canvas2dCompositor;
  private disposed = false;
  /** Play-path: drop overlapping paints instead of queuing. */
  private paintBusy = false;
  onTextureMiss: ((textureKeys: string[]) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.compositor = new Canvas2dCompositor(canvas, width, height);
    this.compositor.onTextureMiss = (keys) => this.onTextureMiss?.(keys);
  }

  async render(args: CompositorPaintArgs): Promise<void> {
    if (this.disposed) {
      args.frameA?.close();
      args.frameB?.close();
      closeLayerFrames(args.stack);
      closeLayerFrames(args.layers);
      return;
    }
    this.compositor.paint(args);
  }

  /**
   * Live play: paint immediately. Canvas2D is CPU — overlapping paints still
   * drop so the clock never waits on a slow still decode.
   */
  paint(args: CompositorPaintArgs): boolean {
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
    try {
      this.compositor.paint(args);
      return true;
    } finally {
      this.paintBusy = false;
    }
  }

  updateTransform(
    transform: [number, number, number, number],
    target: "a" | "b" = "a",
  ): void {
    if (!this.disposed) this.compositor.updateTransform(transform, target);
  }

  updateTextTransform(
    clipId: string,
    transform: [number, number, number, number],
  ): void {
    if (!this.disposed) this.compositor.updateTextTransform(clipId, transform);
  }

  async ensureFonts(families: string[]): Promise<void> {
    if (!this.disposed) await this.compositor.ensureFonts(families);
  }

  resize(width: number, height: number): void {
    if (!this.disposed) this.compositor.resize(width, height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.compositor.dispose();
  }
}

export type { CompositorLayer, CompositorPaintArgs, CompositorTextItem, TransitionType };
