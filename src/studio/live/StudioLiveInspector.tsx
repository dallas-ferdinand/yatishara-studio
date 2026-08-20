"use client";

import { CursorSelect } from "@/desk/components/CursorSelect";
import { StudioColorPicker } from "@/studio/editor/StudioColorPicker";
import { StudioRatioGlyph } from "@/studio/components/StudioRatioGlyph";
import { Circle, Maximize2, RectangleHorizontal, Square } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  DEFAULT_BORDER,
  DEFAULT_SHADOW,
  LIVE_DIGITAL_ZOOM_MAX,
  LIVE_FRAME_PRESETS,
  liveCanvasSize,
  liveRectSize,
  isAudioOnlyKind,
  maskNormalizedAspect,
  normalizeLiveFrameRatio,
  resolveLiveSource,
  resolvedMaskRect,
  scaleLiveRect,
  type LiveFocus,
  type LiveFrameRatio,
  type LiveScene,
  type LiveShape,
  type LiveSource,
} from "./liveMixerModel";

type StudioLiveInspectorProps = {
  selected: LiveSource | null;
  scene?: LiveScene | null;
  onPatch: (patch: Partial<Omit<LiveSource, "id" | "kind">>) => void;
  onScenePatch?: (patch: Partial<Pick<LiveScene, "frameRatio">>) => void;
  recording?: boolean;
  focus?: LiveFocus;
  camera?: {
    provider: string;
    cameras: { value: string; label: string }[];
    selectedDeviceId?: string;
    facing: "user" | "environment";
    torch: boolean;
    torchAvailable: boolean;
    mirror: boolean;
    onFacing: (facing: "user" | "environment") => void;
    onTorch: (on: boolean) => void;
    onMirror: (on: boolean) => void;
    onZoom?: (zoom: number) => void;
    onDevice?: (deviceId: string) => void;
    showFacing?: boolean;
    zoom?: number;
    zoomMin?: number;
    zoomMax?: number;
  } | null;
  onRemember?: (on: boolean) => void;
  onReconnect?: () => void;
  onStopShare?: () => void;
};

function LiveSlider({
  label,
  value,
  min,
  max,
  step,
  format = (n) => String(Math.round(n)),
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (n: number) => string;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const span = Math.max(0.0001, max - min);
  const progress = Math.min(100, Math.max(0, ((value - min) / span) * 100));
  const commit = (raw: string) => {
    setDraft(null);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(Math.min(max, Math.max(min, parsed)));
  };
  return (
    <div className="studio-editor-slider-row">
      <span className="studio-editor-slider-label">{label}</span>
      <div className="studio-editor-slider-row-controls">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="studio-editor-range"
          style={{ "--slider-progress": `${progress}%` } as CSSProperties}
          aria-label={label}
        />
        <input
          type="text"
          inputMode="decimal"
          className="studio-editor-slider-input"
          value={draft ?? format(value)}
          aria-label={`${label} value`}
          onFocus={(event) => {
            setDraft(format(value));
            requestAnimationFrame(() => event.target.select());
          }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </div>
    </div>
  );
}

export function LiveFramePresets({
  value,
  disabled,
  onChange,
}: {
  value: LiveFrameRatio | string | undefined;
  disabled?: boolean;
  onChange: (ratio: LiveFrameRatio) => void;
}) {
  const current = normalizeLiveFrameRatio(value);
  return (
    <div className="studio-editor-frame-presets" role="group" aria-label="Canvas layout">
      {LIVE_FRAME_PRESETS.map((preset) => {
        const active = current === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            className={`studio-editor-frame-preset${active ? " is-active" : ""}`}
            aria-pressed={active}
            disabled={disabled}
            title={`${preset.label} ${preset.shortLabel}`}
            onClick={() => onChange(preset.id)}
          >
            <span className="studio-editor-frame-preset-glyph">
              <StudioRatioGlyph ratio={preset.id} />
            </span>
            <span className="studio-editor-frame-preset-label">{preset.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

const SHAPE_PRESETS: Array<{
  id: LiveShape;
  label: string;
  icon: ReactNode;
}> = [
  { id: "none", label: "None", icon: <Maximize2 size={14} aria-hidden="true" /> },
  { id: "rectangle", label: "Rectangle", icon: <RectangleHorizontal size={14} aria-hidden="true" /> },
  { id: "square", label: "Square", icon: <Square size={14} aria-hidden="true" /> },
  { id: "circle", label: "Circle", icon: <Circle size={14} aria-hidden="true" /> },
];

export function LiveShapePresets({
  value,
  disabled,
  onChange,
}: {
  value: LiveShape | undefined;
  disabled?: boolean;
  onChange: (shape: LiveShape) => void;
}) {
  const current = value ?? "none";
  return (
    <div className="studio-editor-frame-presets studio-live-mask-presets" role="group" aria-label="Mask">
      {SHAPE_PRESETS.map((preset) => {
        const active = current === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            className={`studio-editor-frame-preset${active ? " is-active" : ""}`}
            aria-pressed={active}
            disabled={disabled}
            title={preset.label}
            onClick={() => onChange(preset.id)}
          >
            <span className="studio-editor-frame-preset-glyph">{preset.icon}</span>
            <span className="studio-editor-frame-preset-label">{preset.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="studio-editor-inspector-section">
      <div className="studio-editor-inspector-section-head">
        <h4>{title}</h4>
      </div>
      <div className="studio-editor-inspector-section-body">{children}</div>
    </section>
  );
}

export function StudioLiveInspector({
  selected,
  scene,
  onPatch,
  onScenePatch,
  recording,
  focus = "video",
  camera,
  onRemember,
  onReconnect,
  onStopShare,
}: StudioLiveInspectorProps) {
  if (!selected) {
    return (
      <aside className="studio-live-inspector">
        <div className="studio-editor-inspector-panel-head">
          <div className="studio-editor-inspector-identity">
            <h3>{scene?.name || "Settings"}</h3>
          </div>
        </div>
        <div className="studio-editor-inspector-body">
          <Section title="Canvas">
            <LiveFramePresets
              value={scene?.frameRatio}
              disabled={recording}
              onChange={(frameRatio) => onScenePatch?.({ frameRatio })}
            />
          </Section>
        </div>
      </aside>
    );
  }

  const source = resolveLiveSource(selected);
  const isFillKind = source.kind === "background" || source.kind === "text";
  const isMedia =
    source.kind === "camera" ||
    source.kind === "phone" ||
    source.kind === "screen" ||
    source.kind === "image";
  const shape = source.shape ?? "none";
  const canvasAspect = liveCanvasSize(scene?.frameRatio).ar;
  const shadow = source.shadow ?? DEFAULT_SHADOW;
  const editingMask = focus === "mask" && shape !== "none";
  const hasMask = shape !== "none";
  const mask = resolvedMaskRect(source, canvasAspect);
  const sizeRect = editingMask && mask ? mask : source.rect;
  const activeBorder =
    hasMask && source.maskBorder?.enabled
      ? { ...DEFAULT_BORDER, ...source.maskBorder }
      : { ...DEFAULT_BORDER, ...source.border };

  const patchBorder = (patch: Partial<typeof DEFAULT_BORDER>) => {
    const next = { ...activeBorder, ...patch };
    if (hasMask) onPatch({ border: next, maskBorder: next });
    else onPatch({ border: next });
  };

  const setRect = (patch: Partial<{ x: number; y: number; w: number; h: number }>) => {
    const rect = { ...sizeRect, ...patch };
    if (patch.w != null || patch.h != null) {
      if (editingMask) {
        const maskAr = maskNormalizedAspect(shape, canvasAspect);
        if (maskAr) {
          if (patch.w != null) rect.h = rect.w / maskAr;
          else rect.w = rect.h * maskAr;
        }
      } else if (source.mediaAspect) {
        const target = source.mediaAspect / Math.max(canvasAspect, 0.05);
        if (patch.w != null) rect.h = rect.w / target;
        else rect.w = rect.h * target;
      }
    }
    if (editingMask) onPatch({ maskRect: rect });
    else onPatch({ rect });
  };

  const setShape = (next: LiveShape) => {
    onPatch({ shape: next });
  };

  return (
    <aside className="studio-live-inspector">
      <div className="studio-editor-inspector-panel-head">
        <div className="studio-editor-inspector-identity">
          <h3>{source.name}</h3>
        </div>
      </div>
      <div className="studio-editor-inspector-body">
        {isAudioOnlyKind(source.kind) ? (
          <Section title={source.kind === "mic" ? "Mic" : "System audio"}>
            {source.offline ? (
              <p className="studio-editor-inspector-hint" style={{ padding: 0 }}>
                Disconnected. Share again to pick this source back up.
              </p>
            ) : (
              <p className="studio-editor-inspector-hint" style={{ padding: 0 }}>
                {source.kind === "system"
                  ? "Uses Screen audio when that’s already on. Otherwise Chrome shows a share pick — Entire screen, turn audio on. No picture on the canvas."
                  : "Volume lives in the Mixer. This source has no picture on the canvas."}
              </p>
            )}
            {onReconnect ? (
              <button
                type="button"
                className="studio-live-start"
                onClick={() => onReconnect()}
              >
                {source.kind === "mic" ? "Reconnect mic" : "Connect system audio"}
              </button>
            ) : null}
          </Section>
        ) : (
          <>
        {source.kind === "text" ? (
          <Section title="Text">
            <label className="studio-editor-field-full">
              <input
                value={source.text ?? ""}
                onChange={(event) => onPatch({ text: event.target.value })}
                aria-label="Text"
              />
            </label>
          </Section>
        ) : null}

        {camera ? (
          <Section title="Camera">
            <p className="studio-editor-inspector-hint" style={{ padding: 0 }}>
              {camera.provider}
              {source.cameraLabel ? ` · ${source.cameraLabel}` : ""}
            </p>
            {camera.cameras.length > 1 && camera.onDevice ? (
              <CursorSelect
                variant="field"
                ariaLabel="Camera device"
                value={camera.selectedDeviceId || camera.cameras[0]!.value}
                onChange={(value) => camera.onDevice?.(value)}
                options={camera.cameras}
              />
            ) : null}
            <CursorSelect
              variant="field"
              ariaLabel="Output"
              value={camera.mirror ? "mirror" : "same"}
              onChange={(value) => camera.onMirror(value === "mirror")}
              options={[
                { value: "same", label: "Same side" },
                { value: "mirror", label: "Mirror" },
              ]}
            />
            {camera.showFacing !== false ? (
            <CursorSelect
              variant="field"
              ariaLabel="Facing"
              value={camera.facing}
              onChange={(value) =>
                camera.onFacing(value === "user" ? "user" : "environment")
              }
              options={[
                { value: "environment", label: "Back camera" },
                { value: "user", label: "Front camera" },
              ]}
            />
            ) : null}
            {camera.torchAvailable ? (
              <label className="studio-editor-toggle-row">
                <span>Flash</span>
                <input
                  type="checkbox"
                  className="studio-editor-toggle"
                  checked={camera.torch}
                  onChange={(event) => camera.onTorch(event.target.checked)}
                />
              </label>
            ) : null}
            {camera.onZoom ? (
              <LiveSlider
                label="Zoom"
                value={camera.zoom ?? 1}
                min={camera.zoomMin ?? 1}
                max={camera.zoomMax ?? LIVE_DIGITAL_ZOOM_MAX}
                step={0.1}
                format={(n) => `${n.toFixed(1)}×`}
                onChange={(zoom) => camera.onZoom?.(zoom)}
              />
            ) : null}
          </Section>
        ) : null}

        {source.kind === "phone" || source.kind === "camera" || source.kind === "screen" ? (
          <Section title={source.kind === "screen" ? "Screen" : "Device"}>
            {source.offline ? (
              <p className="studio-editor-inspector-hint" style={{ padding: 0 }}>
                Disconnected. Share again to pick this source back up.
              </p>
            ) : null}
            {source.kind === "screen" && !source.offline && onStopShare ? (
              <button
                type="button"
                className="studio-live-start"
                onClick={() => onStopShare()}
              >
                Stop share
              </button>
            ) : null}
            {onReconnect &&
            (source.kind === "screen" || (source.kind === "camera" && source.offline)) ? (
              <button
                type="button"
                className="studio-live-start"
                onClick={() => onReconnect()}
              >
                {source.kind === "screen" ? "Share screen" : "Reconnect camera"}
              </button>
            ) : null}
            {source.kind !== "screen" ? (
              <>
                <label className="studio-editor-toggle-row">
                  <span>Remember this device</span>
                  <input
                    type="checkbox"
                    className="studio-editor-toggle"
                    checked={source.remembered !== false}
                    onChange={(event) => {
                      onPatch({ remembered: event.target.checked });
                      onRemember?.(event.target.checked);
                    }}
                  />
                </label>
                <p className="studio-editor-inspector-hint" style={{ padding: 0 }}>
                  Keeps layout, mask, and camera settings if it disconnects.
                </p>
              </>
            ) : null}
          </Section>
        ) : null}

        {isFillKind ? (
          <Section title="Fill">
            <CursorSelect
              variant="field"
              ariaLabel="Fill"
              value={source.fill.mode}
              onChange={(value) =>
                onPatch({
                  fill: {
                    ...source.fill,
                    mode: value === "gradient" ? "gradient" : "solid",
                  },
                })
              }
              options={[
                { value: "solid", label: "Solid" },
                { value: "gradient", label: "Gradient" },
              ]}
            />
            <StudioColorPicker
              label={source.fill.mode === "gradient" ? "From" : "Color"}
              value={source.fill.color}
              allowNone={false}
              onChange={(value) =>
                onPatch({ fill: { ...source.fill, color: value ?? source.fill.color } })
              }
            />
            {source.fill.mode === "gradient" ? (
              <>
                <StudioColorPicker
                  label="To"
                  value={source.fill.color2}
                  allowNone={false}
                  onChange={(value) =>
                    onPatch({
                      fill: { ...source.fill, color2: value ?? source.fill.color2 },
                    })
                  }
                />
                <LiveSlider
                  label="Angle"
                  value={source.fill.angle}
                  min={0}
                  max={360}
                  step={1}
                  format={(n) => `${Math.round(n)}°`}
                  onChange={(angle) => onPatch({ fill: { ...source.fill, angle } })}
                />
              </>
            ) : null}
          </Section>
        ) : null}

        {isMedia ? (
          <Section title="Mask">
            <LiveShapePresets
              value={shape}
              disabled={recording}
              onChange={setShape}
            />
            {shape !== "circle" ? (
              <LiveSlider
                label="Rounding"
                value={Math.round((source.radius ?? 0) * 100)}
                min={0}
                max={50}
                step={1}
                format={(n) => `${Math.round(n)}`}
                onChange={(n) => onPatch({ radius: n / 100 })}
              />
            ) : null}
          </Section>
        ) : null}

        <Section title="Shape">
          {!isMedia && shape !== "circle" ? (
            <LiveSlider
              label="Rounding"
              value={Math.round((source.radius ?? 0) * 100)}
              min={0}
              max={50}
              step={1}
              format={(n) => `${Math.round(n)}`}
              onChange={(n) => onPatch({ radius: n / 100 })}
            />
          ) : null}
          <LiveSlider
            label="Opacity"
            value={Math.round((source.opacity ?? 1) * 100)}
            min={0}
            max={100}
            step={1}
            format={(n) => `${Math.round(n)}`}
            onChange={(n) => onPatch({ opacity: n / 100 })}
          />
        </Section>

        <Section title={editingMask ? "Mask size" : "Size"}>
          {isMedia ? (
            <LiveSlider
              label="Size"
              value={Math.round(liveRectSize(sizeRect) * 100)}
              min={3}
              max={100}
              step={1}
              format={(n) => `${Math.round(n)}%`}
              onChange={(n) => {
                const rect = scaleLiveRect(sizeRect, n / 100);
                if (editingMask) onPatch({ maskRect: rect });
                else onPatch({ rect });
              }}
            />
          ) : (
            <>
              <LiveSlider
                label="Width"
                value={Math.round(sizeRect.w * 100)}
                min={3}
                max={100}
                step={1}
                format={(n) => `${Math.round(n)}%`}
                onChange={(n) => setRect({ w: n / 100 })}
              />
              <LiveSlider
                label="Height"
                value={Math.round(sizeRect.h * 100)}
                min={3}
                max={100}
                step={1}
                format={(n) => `${Math.round(n)}%`}
                onChange={(n) => setRect({ h: n / 100 })}
              />
            </>
          )}
          <LiveSlider
            label="X"
            value={Math.round(sizeRect.x * 100)}
            min={-20}
            max={90}
            step={1}
            format={(n) => `${Math.round(n)}%`}
            onChange={(n) => setRect({ x: n / 100 })}
          />
          <LiveSlider
            label="Y"
            value={Math.round(sizeRect.y * 100)}
            min={-20}
            max={90}
            step={1}
            format={(n) => `${Math.round(n)}%`}
            onChange={(n) => setRect({ y: n / 100 })}
          />
        </Section>

        <Section title="Border">
          <label className="studio-editor-toggle-row">
            <span>Border</span>
            <input
              type="checkbox"
              className="studio-editor-toggle"
              checked={activeBorder.enabled}
              onChange={(event) =>
                patchBorder({ enabled: event.target.checked })
              }
            />
          </label>
          {activeBorder.enabled ? (
            <>
              <LiveSlider
                label="Thickness"
                value={activeBorder.width}
                min={1}
                max={48}
                step={1}
                format={(n) => `${Math.round(n)}`}
                onChange={(width) => patchBorder({ width })}
              />
              <StudioColorPicker
                label="Color"
                value={activeBorder.color}
                allowNone={false}
                onChange={(value) =>
                  patchBorder({ color: value ?? activeBorder.color })
                }
              />
            </>
          ) : null}
        </Section>

        <Section title="Shadow">
          <label className="studio-editor-toggle-row">
            <span>Drop shadow</span>
            <input
              type="checkbox"
              className="studio-editor-toggle"
              checked={shadow.enabled}
              onChange={(event) =>
                onPatch({ shadow: { ...shadow, enabled: event.target.checked } })
              }
            />
          </label>
          {shadow.enabled ? (
            <>
              <LiveSlider
                label="Blur"
                value={shadow.blur}
                min={0}
                max={80}
                step={1}
                onChange={(blur) => onPatch({ shadow: { ...shadow, blur } })}
              />
              <LiveSlider
                label="Strength"
                value={Math.round(shadow.opacity * 100)}
                min={0}
                max={100}
                step={1}
                format={(n) => `${Math.round(n)}`}
                onChange={(n) => onPatch({ shadow: { ...shadow, opacity: n / 100 } })}
              />
              <StudioColorPicker
                label="Color"
                value={shadow.color}
                allowNone={false}
                onChange={(value) =>
                  onPatch({ shadow: { ...shadow, color: value ?? shadow.color } })
                }
              />
            </>
          ) : null}
        </Section>
          </>
        )}
      </div>
    </aside>
  );
}
