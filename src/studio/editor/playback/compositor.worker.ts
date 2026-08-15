/// <reference lib="webworker" />

/**
 * Keep this map inlined (no external imports) so Turbopack emits a single
 * classic worker chunk. Importing shared modules creates `otherChunks` that
 * load via `importScripts` and can NetworkError under Turbopack/dev proxies.
 * Must stay aligned with `convex/lib/editorEffectContract.ts`.
 */
const TRANSITION_SHADER_IDS = {
  none: 0,
  crossfade: 1,
  dipToBlack: 2,
  dipToWhite: 3,
  wipeLeft: 4,
  wipeRight: 5,
  wipeUp: 6,
  slideLeft: 7,
  zoomIn: 8,
  blur: 9,
} as const;

function transitionShaderIdFor(value: unknown): number {
  return typeof value === "string" && value in TRANSITION_SHADER_IDS
    ? TRANSITION_SHADER_IDS[value as keyof typeof TRANSITION_SHADER_IDS]
    : TRANSITION_SHADER_IDS.crossfade;
}

type TransitionName =
  | "none"
  | "crossfade"
  | "dipToBlack"
  | "dipToWhite"
  | "wipeLeft"
  | "wipeRight"
  | "wipeUp"
  | "slideLeft"
  | "zoomIn"
  | "blur";

type InitMessage = {
  type: "init";
  canvas: OffscreenCanvas;
  width: number;
  height: number;
};

type ResizeMessage = { type: "resize"; width: number; height: number };
/** [scale, x, y, rotationDegrees] */
type TransformTuple = [number, number, number, number];

type TransformMessage = {
  type: "transform";
  target?: "a" | "b";
  transformA: TransformTuple;
};

type TextTransformMessage = {
  type: "textTransform";
  clipId: string;
  /** [scale, x, y, rotationDegrees] — same tuple as video preview. */
  transform: TransformTuple;
};

type RenderMessage = {
  type: "render";
  requestId: number;
  frameA?: VideoFrame;
  frameB?: VideoFrame;
  transformA?: TransformTuple;
  transformB?: TransformTuple;
  /** Per-clip picture opacity (edge fade in/out). Defaults to 1. */
  opacityA?: number;
  opacityB?: number;
  transition: TransitionName;
  progress: number;
  background: [number, number, number, number];
  textsUnder: Array<{
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
  textsOver: Array<{
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
};

type DisposeMessage = { type: "dispose" };
type EnsureFontsMessage = {
  type: "ensureFonts";
  requestId: number;
  families: string[];
};
type Incoming =
  | InitMessage
  | ResizeMessage
  | TransformMessage
  | TextTransformMessage
  | RenderMessage
  | EnsureFontsMessage
  | DisposeMessage;

const vertexSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform sampler2D u_textUnder;
uniform sampler2D u_textOver;
uniform vec2 u_aSize;
uniform vec2 u_bSize;
uniform vec2 u_canvasSize;
uniform vec4 u_aTransform;
uniform vec4 u_bTransform;
uniform float u_progress;
uniform float u_opacityA;
uniform float u_opacityB;
uniform int u_effect;
uniform bool u_hasA;
uniform bool u_hasB;
uniform vec4 u_background;
in vec2 v_uv;
out vec4 outColor;

vec2 containedSize(vec2 sourceSize) {
  float sourceAspect = sourceSize.x / max(1.0, sourceSize.y);
  float canvasAspect = u_canvasSize.x / max(1.0, u_canvasSize.y);
  if (sourceAspect > canvasAspect) {
    return vec2(1.0, canvasAspect / sourceAspect);
  }
  return vec2(sourceAspect / canvasAspect, 1.0);
}

vec4 sampleFrame(sampler2D tex, vec2 uv, vec2 sourceSize, vec4 transform, float opacity) {
  vec2 objectSize = containedSize(sourceSize) * max(transform.x, 0.0);
  if (objectSize.x < 1e-5 || objectSize.y < 1e-5) {
    return vec4(0.0);
  }
  // CSS/editor Y grows downward; WebGL UV Y grows upward after texture flip.
  vec2 objectCenter = vec2(0.5 + transform.y, 0.5 - transform.z);
  vec2 delta = uv - objectCenter;
  // Rotate in canvas-aspect space so degrees match the CSS overlay.
  float aspect = u_canvasSize.x / max(1.0, u_canvasSize.y);
  delta.x *= aspect;
  float rad = radians(transform.w);
  float c = cos(rad);
  float s = sin(rad);
  vec2 rotated = vec2(c * delta.x - s * delta.y, s * delta.x + c * delta.y);
  rotated.x /= aspect;
  vec2 local = (rotated + objectSize * 0.5) / objectSize;
  if (local.x < 0.0 || local.x > 1.0 || local.y < 0.0 || local.y > 1.0) {
    // Transparent outside so under-lane text can show in letterbox / around PiP.
    return vec4(0.0);
  }
  // Textures are uploaded premultiplied — keep PM so soft PNG edges don't glow.
  return texture(tex, local) * clamp(opacity, 0.0, 1.0);
}

vec4 blurFrame(sampler2D tex, vec2 uv, vec2 sourceSize, vec4 transform, float radius, float opacity) {
  // 5-tap cross — enough for scrub preview without the old 9-tap hitch.
  vec2 px = radius / max(sourceSize, vec2(1.0));
  vec4 color = sampleFrame(tex, uv, sourceSize, transform, opacity) * 0.36;
  color += sampleFrame(tex, uv + vec2(px.x, 0.0), sourceSize, transform, opacity) * 0.16;
  color += sampleFrame(tex, uv - vec2(px.x, 0.0), sourceSize, transform, opacity) * 0.16;
  color += sampleFrame(tex, uv + vec2(0.0, px.y), sourceSize, transform, opacity) * 0.16;
  color += sampleFrame(tex, uv - vec2(0.0, px.y), sourceSize, transform, opacity) * 0.16;
  return color;
}

void main() {
  vec4 layer = u_background;
  vec4 underText = texture(u_textUnder, v_uv);
  layer = underText + layer * (1.0 - underText.a);

  if (u_hasA || u_hasB) {
    float opa = clamp(u_opacityA, 0.0, 1.0);
    float opb = clamp(u_opacityB, 0.0, 1.0);
    vec4 a = u_hasA ? sampleFrame(u_a, v_uv, u_aSize, u_aTransform, opa) : vec4(0.0);
    vec4 b = u_hasB ? sampleFrame(u_b, v_uv, u_bSize, u_bTransform, opb) : a;
    float p = clamp(u_progress, 0.0, 1.0);
    vec4 base;

    if (u_effect == 1) {
      base = mix(a, b, p);
    } else if (u_effect == 2 || u_effect == 3) {
      vec4 dip = u_effect == 3 ? vec4(1.0) : vec4(0.0, 0.0, 0.0, 1.0);
      base = p < 0.5 ? mix(a, dip, p * 2.0) : mix(dip, b, (p - 0.5) * 2.0);
    } else if (u_effect == 4) {
      base = v_uv.x < p ? b : a;
    } else if (u_effect == 5) {
      base = v_uv.x > 1.0 - p ? b : a;
    } else if (u_effect == 6) {
      base = v_uv.y > 1.0 - p ? b : a;
    } else if (u_effect == 7) {
      vec4 movedA = sampleFrame(u_a, v_uv + vec2(p, 0.0), u_aSize, u_aTransform, opa);
      vec4 movedB = sampleFrame(u_b, v_uv - vec2(1.0 - p, 0.0), u_bSize, u_bTransform, opb);
      base = v_uv.x < 1.0 - p ? movedA : movedB;
    } else if (u_effect == 8) {
      vec2 aUv = (v_uv - 0.5) / (1.0 + p * 0.28) + 0.5;
      vec2 bUv = (v_uv - 0.5) / (0.88 + p * 0.12) + 0.5;
      base = mix(
        sampleFrame(u_a, aUv, u_aSize, u_aTransform, opa),
        sampleFrame(u_b, bUv, u_bSize, u_bTransform, opb),
        p
      );
    } else if (u_effect == 9) {
      base = mix(
        blurFrame(u_a, v_uv, u_aSize, u_aTransform, p * 10.0, opa),
        blurFrame(u_b, v_uv, u_bSize, u_bTransform, (1.0 - p) * 10.0, opb),
        p
      );
    } else if (u_hasA && u_hasB) {
      // Stack: A (top) over B — Porter-Duff source-over on premultiplied RGBA.
      // Straight-alpha "over" here reads as a soft white/coloured glow on PNGs.
      base = a + b * (1.0 - a.a);
    } else {
      base = a;
    }
    // Premultiplied over opaque (or transparent) project background.
    layer = base + layer * (1.0 - base.a);
  }

  vec4 overText = texture(u_textOver, v_uv);
  outColor = overText + layer * (1.0 - overText.a);
}`;

let canvas: OffscreenCanvas | null = null;
let gl: WebGL2RenderingContext | null = null;
let program: WebGLProgram | null = null;
let textureA: WebGLTexture | null = null;
let textureB: WebGLTexture | null = null;
let textureTextUnder: WebGLTexture | null = null;
let textureTextOver: WebGLTexture | null = null;
let textCanvas: OffscreenCanvas | null = null;
let lastTextsUnder: RenderMessage["textsUnder"] = [];
let lastTextsOver: RenderMessage["textsOver"] = [];
let textContext: OffscreenCanvasRenderingContext2D | null = null;

function compileShader(context: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = context.createShader(type);
  if (!shader) throw new Error("Could not allocate compositor shader.");
  context.shaderSource(shader, source);
  context.compileShader(shader);
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const message = context.getShaderInfoLog(shader) ?? "Unknown shader error.";
    context.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createTexture(context: WebGL2RenderingContext): WebGLTexture {
  const texture = context.createTexture();
  if (!texture) throw new Error("Could not allocate compositor texture.");
  context.bindTexture(context.TEXTURE_2D, texture);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
  return texture;
}

function initialize(message: InitMessage): void {
  canvas = message.canvas;
  canvas.width = message.width;
  canvas.height = message.height;
  gl = canvas.getContext("webgl2", {
    // Opaque frame — transparent WebGL alpha punched clicks through the canvas
    // and made resize/drag feel broken. PNG cutouts still reveal underlay video
    // via dual-texture source-over inside this opaque buffer.
    alpha: false,
    antialias: false,
    depth: false,
    desynchronized: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
    premultipliedAlpha: true,
  });
  if (!gl) throw new Error("WebGL2 compositor is unavailable.");
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  program = gl.createProgram();
  if (!program) throw new Error("Could not allocate compositor program.");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Compositor program link failed.");
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  textureA = createTexture(gl);
  textureB = createTexture(gl);
  textureTextUnder = createTexture(gl);
  textureTextOver = createTexture(gl);
  textCanvas = new OffscreenCanvas(canvas.width, canvas.height);
  textContext = textCanvas.getContext("2d");
  gl.uniform1i(gl.getUniformLocation(program, "u_a"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_b"), 1);
  gl.uniform1i(gl.getUniformLocation(program, "u_textUnder"), 2);
  gl.uniform1i(gl.getUniformLocation(program, "u_textOver"), 3);
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function upload(
  context: WebGL2RenderingContext,
  texture: WebGLTexture,
  unit: number,
  frame?: VideoFrame,
): void {
  if (!frame) return;
  context.activeTexture(unit);
  context.bindTexture(context.TEXTURE_2D, texture);
  context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, true);
  // Premultiply on upload so LINEAR filter + source-over don't fringe/glow PNGs.
  context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  context.texImage2D(
    context.TEXTURE_2D,
    0,
    context.RGBA,
    context.RGBA,
    context.UNSIGNED_BYTE,
    frame,
  );
}

function uniform(name: string): WebGLUniformLocation | null {
  return gl && program ? gl.getUniformLocation(program, name) : null;
}

type TextItem = RenderMessage["textsOver"][number];

const SYSTEM_STACKS: Record<string, string> = {
  system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  sans: "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', Times, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  display: "Impact, Haettenschweiler, 'Arial Black', sans-serif",
};

const loadedWorkerFonts = new Set<string>();
const loadingWorkerFonts = new Map<string, Promise<void>>();

function isSystemFamily(family: string | undefined): boolean {
  return !family || family in SYSTEM_STACKS;
}

function googleCssFamilyParam(family: string): string {
  return family.trim().replace(/\s+/g, "+");
}

/** Load Google Fonts into the worker FontFaceSet (document fonts are not shared). */
async function ensureWorkerFonts(families: string[]): Promise<void> {
  const fonts = (self as unknown as { fonts?: FontFaceSet }).fonts;
  if (!fonts) return;
  const jobs: Promise<void>[] = [];
  for (const raw of families) {
    const family = (raw || "").trim();
    if (!family || isSystemFamily(family) || loadedWorkerFonts.has(family)) continue;
    const existing = loadingWorkerFonts.get(family);
    if (existing) {
      jobs.push(existing);
      continue;
    }
    const job = (async () => {
      try {
        const cssUrl =
          `https://fonts.googleapis.com/css2?family=${googleCssFamilyParam(family)}:wght@400;600;700&display=swap`;
        const cssRes = await fetch(cssUrl, {
          headers: {
            // Request woff2 so FontFace works in Chromium workers.
            Accept: "text/css,*/*;q=0.1",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        if (!cssRes.ok) return;
        const css = await cssRes.text();
        const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) =>
          m[1]!.replace(/['"]/g, ""),
        );
        const unique = [...new Set(urls)].slice(0, 6);
        await Promise.all(
          unique.map(async (src) => {
            try {
              const face = new FontFace(family, `url(${src})`, {
                weight: "1 900",
                style: "normal",
                display: "swap",
              });
              const loaded = await face.load();
              fonts.add(loaded);
            } catch {
              /* skip broken face */
            }
          }),
        );
        loadedWorkerFonts.add(family);
        await Promise.all([
          fonts.load(`400 42px "${family}"`).catch(() => undefined),
          fonts.load(`600 42px "${family}"`).catch(() => undefined),
          fonts.load(`700 42px "${family}"`).catch(() => undefined),
        ]);
      } finally {
        loadingWorkerFonts.delete(family);
      }
    })();
    loadingWorkerFonts.set(family, job);
    jobs.push(job);
  }
  await Promise.all(jobs);
}

function cssFontFamily(family: string): string {
  const id = family || "system";
  if (id in SYSTEM_STACKS) return SYSTEM_STACKS[id]!;
  const safe = id.includes(" ") ? `'${id.replace(/'/g, "\\'")}'` : id;
  return `${safe}, system-ui, sans-serif`;
}

function applyCase(text: string, mode: TextItem["textCase"]): string {
  if (mode === "upper") return text.toUpperCase();
  if (mode === "lower") return text.toLowerCase();
  if (mode === "title") {
    return text.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  return text;
}


function uploadTextLayer(
  texture: WebGLTexture,
  unit: number,
  items: TextItem[],
): void {
  if (!gl || !canvas || !textCanvas || !textContext) return;
  if (textCanvas.width !== canvas.width || textCanvas.height !== canvas.height) {
    textCanvas.width = canvas.width;
    textCanvas.height = canvas.height;
  }
  textContext.clearRect(0, 0, textCanvas.width, textCanvas.height);
  textContext.textBaseline = "middle";
  for (const item of items) {
    textContext.save();
    textContext.globalAlpha = item.opacity;
    const weight = item.bold ? "700" : "600";
    const style = item.italic ? "italic " : "";
    const family = cssFontFamily(item.fontFamily);
    // Bake pose/anim scale into font metrics instead of ctx.scale() so
    // shadowBlur / stroke halos aren't clipped by transform bounding boxes.
    const sizeScale = Math.max(0.05, item.poseScale * item.scale);
    const fontSize = item.fontSize * sizeScale;
    const strokeW = Math.max(0, item.strokeWidth) * sizeScale;
    const glowBlur = (item.glowBlur ?? 12) * sizeScale;
    const shadowBlur = (item.shadowBlur ?? 0) * sizeScale;
    const shadowOx = (item.shadowOffsetX ?? 0) * sizeScale;
    const shadowOy = (item.shadowOffsetY ?? 0) * sizeScale;
    textContext.font = `${style}${weight} ${fontSize}px ${family}`;
    textContext.textAlign = item.align;
    try {
      (textContext as unknown as { letterSpacing?: string }).letterSpacing =
        `${(item.letterSpacing ?? 0) * fontSize}px`;
    } catch {
      /* letterSpacing unsupported */
    }
    const display = applyCase(item.text, item.textCase ?? "none");
    const lines = display.split("\n");
    const lineHeight = fontSize * Math.max(0.8, item.lineHeight ?? 1.2);
    const blockH = Math.max(lineHeight, lines.length * lineHeight);
    let maxW = 0;
    for (const line of lines) {
      maxW = Math.max(maxW, textContext.measureText(line || " ").width);
    }
    // Inflate background so stroke + glow aren't boxed out.
    const effectPad =
      strokeW * 0.6 +
      (item.glow ? glowBlur * 0.55 : 0) +
      (item.shadowColor ? Math.max(Math.abs(shadowOx), Math.abs(shadowOy)) + shadowBlur * 0.35 : 0);
    const pad =
      (item.backgroundColor ? (item.backgroundPadding ?? 8) * sizeScale : 0) +
      (item.backgroundColor ? effectPad * 0.35 : 0);
    const x = (0.5 + item.poseX) * textCanvas.width;
    const y = (0.5 + item.poseY) * textCanvas.height + item.translateY;
    textContext.translate(x, y);
    textContext.rotate((item.rotation * Math.PI) / 180);
    // Flip only — size already baked into fontSize / stroke / blur.
    textContext.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);

    const vAlign = item.verticalAlign ?? "middle";
    const blockTop =
      vAlign === "top" ? 0 : vAlign === "bottom" ? -blockH : -blockH / 2;
    const boxLeft =
      item.align === "left"
        ? -pad
        : item.align === "right"
          ? -maxW - pad
          : -maxW / 2 - pad;

    if (item.backgroundColor) {
      const bw = maxW + pad * 2;
      const bh = blockH + pad * 2;
      const bx = boxLeft;
      const by = blockTop - pad;
      const radius = Math.max(
        0,
        Math.min(
          (item.backgroundRadius ?? 0) * sizeScale,
          bw / 2,
          bh / 2,
        ),
      );
      textContext.fillStyle = item.backgroundColor;
      if (radius <= 0.5) {
        textContext.fillRect(bx, by, bw, bh);
      } else {
        textContext.beginPath();
        const rr = (
          textContext as OffscreenCanvasRenderingContext2D & {
            roundRect?: (
              x: number,
              y: number,
              w: number,
              h: number,
              r: number,
            ) => void;
          }
        ).roundRect;
        if (typeof rr === "function") {
          rr.call(textContext, bx, by, bw, bh, radius);
        } else {
          // Fallback path for environments without roundRect.
          textContext.moveTo(bx + radius, by);
          textContext.arcTo(bx + bw, by, bx + bw, by + bh, radius);
          textContext.arcTo(bx + bw, by + bh, bx, by + bh, radius);
          textContext.arcTo(bx, by + bh, bx, by, radius);
          textContext.arcTo(bx, by, bx + bw, by, radius);
          textContext.closePath();
        }
        textContext.fill();
      }
    }

    // Local alias: nested closures don't keep the null narrowing on textContext.
    const ctx = textContext;
    const drawGlyphLine = (line: string, ly: number) => {
      if (strokeW > 0) {
        ctx.lineWidth = strokeW;
        ctx.strokeStyle = item.strokeColor || "#000000";
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.strokeText(line, 0, ly);
      }
      ctx.fillText(line, 0, ly);
    };

    const drawAllLines = () => {
      ctx.fillStyle = item.color;
      for (let i = 0; i < lines.length; i += 1) {
        const ly = blockTop + lineHeight * i + lineHeight / 2;
        drawGlyphLine(lines[i] ?? "", ly);
      }
    };

    // Glow pass (halo) — independent from drop shadow so presets can use both.
    if (item.glow) {
      textContext.shadowColor = item.glowColor || "#ffffff";
      textContext.shadowBlur = glowBlur;
      textContext.shadowOffsetX = 0;
      textContext.shadowOffsetY = 0;
      drawAllLines();
      textContext.shadowColor = "transparent";
      textContext.shadowBlur = 0;
      textContext.shadowOffsetX = 0;
      textContext.shadowOffsetY = 0;
    }

    // Drop shadow and/or final crisp fill (also when no glow).
    if (item.shadowColor) {
      textContext.shadowColor = item.shadowColor;
      textContext.shadowBlur = shadowBlur;
      textContext.shadowOffsetX = shadowOx;
      textContext.shadowOffsetY = shadowOy;
    } else {
      textContext.shadowColor = "transparent";
      textContext.shadowBlur = 0;
      textContext.shadowOffsetX = 0;
      textContext.shadowOffsetY = 0;
    }
    drawAllLines();

    if (item.underline) {
      textContext.shadowColor = "transparent";
      textContext.shadowBlur = 0;
      textContext.fillStyle = item.color;
      for (let i = 0; i < lines.length; i += 1) {
        const ly = blockTop + lineHeight * i + lineHeight / 2;
        const line = lines[i] ?? "";
        const w = textContext.measureText(line || " ").width;
        const ux =
          item.align === "left"
            ? 0
            : item.align === "right"
              ? -w
              : -w / 2;
        textContext.strokeStyle = item.color;
        textContext.lineWidth = Math.max(1, fontSize * 0.06);
        textContext.beginPath();
        textContext.moveTo(ux, ly + fontSize * 0.35);
        textContext.lineTo(ux + w, ly + fontSize * 0.35);
        textContext.stroke();
      }
    }
    textContext.restore();
  }
  gl.activeTexture(unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    textCanvas,
  );
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
}

function render(message: RenderMessage): void {
  if (
    !gl ||
    !program ||
    !canvas ||
    !textureA ||
    !textureB ||
    !textureTextUnder ||
    !textureTextOver
  ) {
    throw new Error("Compositor is not initialized.");
  }
  const a = message.frameA;
  const b = message.frameB;
  try {
    upload(gl, textureA, gl.TEXTURE0, a);
    upload(gl, textureB, gl.TEXTURE1, b);
    lastTextsUnder = message.textsUnder;
    lastTextsOver = message.textsOver;
    uploadTextLayer(textureTextUnder, gl.TEXTURE2, lastTextsUnder);
    uploadTextLayer(textureTextOver, gl.TEXTURE3, lastTextsOver);
    gl.useProgram(program);
    gl.uniform2f(uniform("u_aSize"), a?.displayWidth ?? 1, a?.displayHeight ?? 1);
    gl.uniform2f(uniform("u_bSize"), b?.displayWidth ?? 1, b?.displayHeight ?? 1);
    gl.uniform2f(uniform("u_canvasSize"), canvas.width, canvas.height);
    const transformA = message.transformA ?? [1, 0, 0, 0];
    const transformB = message.transformB ?? [1, 0, 0, 0];
    gl.uniform4f(
      uniform("u_aTransform"),
      transformA[0],
      transformA[1],
      transformA[2],
      transformA[3],
    );
    gl.uniform4f(
      uniform("u_bTransform"),
      transformB[0],
      transformB[1],
      transformB[2],
      transformB[3],
    );
    gl.uniform1f(uniform("u_progress"), message.progress);
    gl.uniform1f(
      uniform("u_opacityA"),
      Number.isFinite(message.opacityA) ? Number(message.opacityA) : 1,
    );
    gl.uniform1f(
      uniform("u_opacityB"),
      Number.isFinite(message.opacityB) ? Number(message.opacityB) : 1,
    );
    gl.uniform1i(uniform("u_effect"), transitionShaderIdFor(message.transition));
    gl.uniform1i(uniform("u_hasA"), a ? 1 : 0);
    gl.uniform1i(uniform("u_hasB"), b ? 1 : 0);
    gl.uniform4fv(uniform("u_background"), message.background);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.flush();
  } finally {
    a?.close();
    b?.close();
  }
  self.postMessage({ type: "rendered", requestId: message.requestId });
}

function redrawCompositor(): void {
  if (!gl || !program || !canvas) return;
  gl.useProgram(program);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.flush();
}

function updateTransform(message: TransformMessage): void {
  if (!gl || !program || !canvas) return;
  gl.useProgram(program);
  const name = message.target === "b" ? "u_bTransform" : "u_aTransform";
  gl.uniform4f(
    uniform(name),
    message.transformA[0],
    message.transformA[1],
    message.transformA[2],
    message.transformA[3],
  );
  redrawCompositor();
}

/** Live text pose (no React) — same idea as video updateTransform. */
function updateTextTransform(message: TextTransformMessage): void {
  if (!gl || !program || !canvas || !textureTextUnder || !textureTextOver) return;
  const [scale, x, y, rotation] = message.transform;
  const patch = (items: TextItem[]): TextItem[] =>
    items.map((item) =>
      item.clipId === message.clipId
        ? {
            ...item,
            poseScale: scale,
            poseX: x,
            poseY: y,
            rotation,
          }
        : item,
    );
  lastTextsUnder = patch(lastTextsUnder);
  lastTextsOver = patch(lastTextsOver);
  uploadTextLayer(textureTextUnder, gl.TEXTURE2, lastTextsUnder);
  uploadTextLayer(textureTextOver, gl.TEXTURE3, lastTextsOver);
  redrawCompositor();
}

self.onmessage = (event: MessageEvent<Incoming>) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      initialize(message);
      self.postMessage({ type: "ready" });
    } else if (message.type === "resize" && canvas && gl) {
      canvas.width = Math.max(1, message.width);
      canvas.height = Math.max(1, message.height);
      gl.viewport(0, 0, canvas.width, canvas.height);
    } else if (message.type === "transform") {
      updateTransform(message);
    } else if (message.type === "textTransform") {
      updateTextTransform(message);
    } else if (message.type === "ensureFonts") {
      void ensureWorkerFonts(message.families).then(() => {
        self.postMessage({ type: "fontsReady", requestId: message.requestId });
      }).catch((error) => {
        self.postMessage({
          type: "error",
          requestId: message.requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    } else if (message.type === "render") {
      render(message);
    } else if (message.type === "dispose") {
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      close();
    }
  } catch (error) {
    if (message.type === "render") {
      message.frameA?.close();
      message.frameB?.close();
    }
    self.postMessage({
      type: "error",
      requestId: message.type === "render" ? message.requestId : undefined,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
