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
  transformA: TransformTuple;
};

type RenderMessage = {
  type: "render";
  requestId: number;
  frameA?: VideoFrame;
  frameB?: VideoFrame;
  transformA?: TransformTuple;
  transformB?: TransformTuple;
  transition: TransitionName;
  progress: number;
  background: [number, number, number, number];
  texts: Array<{
    text: string;
    fontSize: number;
    color: string;
    align: "left" | "center" | "right";
    opacity: number;
    translateY: number;
    scale: number;
  }>;
};

type DisposeMessage = { type: "dispose" };
type Incoming =
  | InitMessage
  | ResizeMessage
  | TransformMessage
  | RenderMessage
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
uniform sampler2D u_text;
uniform vec2 u_aSize;
uniform vec2 u_bSize;
uniform vec2 u_canvasSize;
uniform vec4 u_aTransform;
uniform vec4 u_bTransform;
uniform float u_progress;
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

vec4 sampleFrame(sampler2D tex, vec2 uv, vec2 sourceSize, vec4 transform) {
  vec2 objectSize = containedSize(sourceSize) * max(transform.x, 0.05);
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
    return u_background;
  }
  return texture(tex, local);
}

vec4 blurFrame(sampler2D tex, vec2 uv, vec2 sourceSize, vec4 transform, float radius) {
  vec2 px = radius / max(sourceSize, vec2(1.0));
  vec4 color = sampleFrame(tex, uv, sourceSize, transform) * 0.2;
  color += sampleFrame(tex, uv + vec2(px.x, 0.0), sourceSize, transform) * 0.12;
  color += sampleFrame(tex, uv - vec2(px.x, 0.0), sourceSize, transform) * 0.12;
  color += sampleFrame(tex, uv + vec2(0.0, px.y), sourceSize, transform) * 0.12;
  color += sampleFrame(tex, uv - vec2(0.0, px.y), sourceSize, transform) * 0.12;
  color += sampleFrame(tex, uv + px, sourceSize, transform) * 0.08;
  color += sampleFrame(tex, uv - px, sourceSize, transform) * 0.08;
  color += sampleFrame(tex, uv + vec2(px.x, -px.y), sourceSize, transform) * 0.08;
  color += sampleFrame(tex, uv + vec2(-px.x, px.y), sourceSize, transform) * 0.08;
  return color;
}

void main() {
  vec4 base;
  if (!u_hasA && !u_hasB) {
    base = u_background;
  } else {
    vec4 a = u_hasA ? sampleFrame(u_a, v_uv, u_aSize, u_aTransform) : u_background;
    vec4 b = u_hasB ? sampleFrame(u_b, v_uv, u_bSize, u_bTransform) : a;
    float p = clamp(u_progress, 0.0, 1.0);

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
      vec4 movedA = sampleFrame(u_a, v_uv + vec2(p, 0.0), u_aSize, u_aTransform);
      vec4 movedB = sampleFrame(u_b, v_uv - vec2(1.0 - p, 0.0), u_bSize, u_bTransform);
      base = v_uv.x < 1.0 - p ? movedA : movedB;
    } else if (u_effect == 8) {
      vec2 aUv = (v_uv - 0.5) / (1.0 + p * 0.28) + 0.5;
      vec2 bUv = (v_uv - 0.5) / (0.88 + p * 0.12) + 0.5;
      base = mix(
        sampleFrame(u_a, aUv, u_aSize, u_aTransform),
        sampleFrame(u_b, bUv, u_bSize, u_bTransform),
        p
      );
    } else if (u_effect == 9) {
      base = mix(
        blurFrame(u_a, v_uv, u_aSize, u_aTransform, p * 10.0),
        blurFrame(u_b, v_uv, u_bSize, u_bTransform, (1.0 - p) * 10.0),
        p
      );
    } else {
      base = a;
    }
  }
  vec4 textColor = texture(u_text, v_uv);
  outColor = textColor + base * (1.0 - textColor.a);
}`;

let canvas: OffscreenCanvas | null = null;
let gl: WebGL2RenderingContext | null = null;
let program: WebGLProgram | null = null;
let textureA: WebGLTexture | null = null;
let textureB: WebGLTexture | null = null;
let textureText: WebGLTexture | null = null;
let textCanvas: OffscreenCanvas | null = null;
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
    alpha: false,
    antialias: false,
    depth: false,
    desynchronized: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
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
  textureText = createTexture(gl);
  textCanvas = new OffscreenCanvas(canvas.width, canvas.height);
  textContext = textCanvas.getContext("2d");
  gl.uniform1i(gl.getUniformLocation(program, "u_a"), 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_b"), 1);
  gl.uniform1i(gl.getUniformLocation(program, "u_text"), 2);
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

function render(message: RenderMessage): void {
  if (!gl || !program || !canvas || !textureA || !textureB || !textureText) {
    throw new Error("Compositor is not initialized.");
  }
  const a = message.frameA;
  const b = message.frameB;
  try {
    upload(gl, textureA, gl.TEXTURE0, a);
    upload(gl, textureB, gl.TEXTURE1, b);
    if (textCanvas && textContext) {
      if (textCanvas.width !== canvas.width || textCanvas.height !== canvas.height) {
        textCanvas.width = canvas.width;
        textCanvas.height = canvas.height;
      }
      textContext.clearRect(0, 0, textCanvas.width, textCanvas.height);
      textContext.textBaseline = "middle";
      for (const item of message.texts) {
        textContext.save();
        textContext.globalAlpha = item.opacity;
        textContext.fillStyle = item.color;
        textContext.font = `600 ${item.fontSize}px system-ui, sans-serif`;
        textContext.textAlign = item.align;
        const x =
          item.align === "left"
            ? textCanvas.width * 0.08
            : item.align === "right"
              ? textCanvas.width * 0.92
              : textCanvas.width * 0.5;
        const y = textCanvas.height * 0.82 + item.translateY;
        textContext.translate(x, y);
        textContext.scale(item.scale, item.scale);
        textContext.fillText(item.text, 0, 0);
        textContext.restore();
      }
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, textureText);
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

function updateTransform(message: TransformMessage): void {
  if (!gl || !program || !canvas) return;
  gl.useProgram(program);
  gl.uniform4f(
    uniform("u_aTransform"),
    message.transformA[0],
    message.transformA[1],
    message.transformA[2],
    message.transformA[3],
  );
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.flush();
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
