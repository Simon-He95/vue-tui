import type { T3DRenderContext, T3DRenderer } from "../../../vue/components/T3DViewport.js";
import type { TVideoFrame } from "../../../vue/video/types.js";
import { globalConstructors, setupGlobals } from "bun-webgpu";
import { contributorAvatarAtlas } from "./contributor-avatar-atlas.js";
import { encodeRgbaPng } from "./png.js";
import { pickTerminalBadgeContributor } from "./terminal-badge-scene.js";
import { terminalBadge3DWgsl } from "./terminal-badge.wgsl.js";

const UNIFORM_BYTES = 80;
const WORKGROUP_SIZE = 8;

let webGpuSetup: Promise<void> | undefined;

export type BunWebGPUTextureData = Readonly<{
  /** Texture width in pixels. */
  width: number;
  /** Texture height in pixels. */
  height: number;
  /** Tightly packed RGBA8 pixels, ordered from top-left to bottom-right. */
  rgba: Uint8Array;
}>;

export type BunWebGPU3DRendererOptions = Readonly<{
  /** Compute shader with the T3D uniform block at binding 0 and RGBA8 storage output at binding 1. */
  shader: string;
  /** Optional RGBA8 sampled texture exposed to the shader at binding 2. */
  texture?: BunWebGPUTextureData;
  /** Label included in WebGPU resources and error messages. */
  label?: string;
}>;

export type TerminalBadge3DRendererOptions = Readonly<{
  /** Label included in WebGPU resources and error messages. */
  label?: string;
}>;

type WebGpuBuffer = {
  mapAsync: (mode: number) => Promise<unknown>;
  getMappedRange: () => ArrayBuffer;
  unmap: () => void;
  destroy: () => void;
};

type WebGpuTexture = {
  createView: () => unknown;
  destroy: () => void;
};

type WebGpuComputePipeline = {
  getBindGroupLayout: (index: number) => unknown;
  destroy?: () => void;
};

type WebGpuBindGroup = { destroy?: () => void };
type WebGpuCommandEncoder = {
  beginComputePass: (descriptor?: Record<string, unknown>) => {
    setPipeline: (pipeline: WebGpuComputePipeline) => void;
    setBindGroup: (index: number, group: WebGpuBindGroup) => void;
    dispatchWorkgroups: (x: number, y?: number, z?: number) => void;
    end: () => void;
  };
  copyBufferToBuffer: (
    source: WebGpuBuffer,
    sourceOffset: number,
    destination: WebGpuBuffer,
    destinationOffset: number,
    size: number,
  ) => void;
  finish: () => unknown;
};

type WebGpuDevice = {
  queue: {
    writeBuffer: (buffer: WebGpuBuffer, offset: number, data: ArrayBuffer) => void;
    writeTexture: (
      destination: Record<string, unknown>,
      data: Uint8Array,
      dataLayout: Record<string, unknown>,
      writeSize: Record<string, unknown>,
    ) => void;
    submit: (commands: Iterable<unknown>) => void;
  };
  pushErrorScope: (filter: string) => void;
  popErrorScope: () => Promise<{ message: string } | null>;
  createShaderModule: (descriptor: Record<string, unknown>) => unknown;
  createComputePipeline: (descriptor: Record<string, unknown>) => WebGpuComputePipeline;
  createBuffer: (descriptor: Record<string, unknown>) => WebGpuBuffer;
  createTexture: (descriptor: Record<string, unknown>) => WebGpuTexture;
  createBindGroup: (descriptor: Record<string, unknown>) => WebGpuBindGroup;
  createCommandEncoder: (descriptor?: Record<string, unknown>) => WebGpuCommandEncoder;
  destroy: () => void;
};

type WebGpu = {
  requestAdapter: (options?: Record<string, unknown>) => Promise<{
    requestDevice: () => Promise<WebGpuDevice>;
  } | null>;
};

type RenderResources = Readonly<{
  width: number;
  height: number;
  byteLength: number;
  output: WebGpuBuffer;
  readback: WebGpuBuffer;
  bindGroup: WebGpuBindGroup;
}>;

type RendererState = Readonly<{
  device: WebGpuDevice;
  pipeline: WebGpuComputePipeline;
  uniforms: WebGpuBuffer;
  texture?: WebGpuTexture;
  textureView?: unknown;
}>;

function abortError(): Error {
  const error = new Error("T3D WebGPU render aborted");
  error.name = "AbortError";
  return error;
}

function assertBunRuntime(): void {
  if (!(globalThis as typeof globalThis & { Bun?: unknown }).Bun) {
    throw new Error(
      "The Bun WebGPU renderer requires Bun. Import it from @simon_he/vue-tui/experimental/3d/bun and run with bun.",
    );
  }
}

function currentGpu(): WebGpu | undefined {
  return (globalThis as typeof globalThis & { navigator?: { gpu?: WebGpu } }).navigator?.gpu;
}

async function ensureWebGPU(): Promise<WebGpu> {
  assertBunRuntime();
  let gpu = currentGpu();
  if (gpu) return gpu;
  webGpuSetup ??= setupGlobals();
  await webGpuSetup;
  gpu = currentGpu();
  if (!gpu) throw new Error("bun-webgpu initialized without exposing navigator.gpu");
  return gpu;
}

function fingerprint(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function normalizeTextureData(
  texture: BunWebGPUTextureData | undefined,
): BunWebGPUTextureData | undefined {
  if (!texture) return undefined;
  const width = texture.width;
  const height = texture.height;
  if (!Number.isSafeInteger(width) || width <= 0) {
    throw new Error("WebGPU texture width must be a positive integer");
  }
  if (!Number.isSafeInteger(height) || height <= 0) {
    throw new Error("WebGPU texture height must be a positive integer");
  }
  const expectedBytes = width * height * 4;
  if (!Number.isSafeInteger(expectedBytes) || texture.rgba.byteLength !== expectedBytes) {
    throw new Error(
      `WebGPU texture RGBA byte length mismatch: expected ${expectedBytes}, got ${texture.rgba.byteLength}`,
    );
  }
  return { width, height, rgba: texture.rgba.slice() };
}

export function rgbaToGray8(rgba: Uint8Array): Uint8Array {
  if (rgba.byteLength % 4 !== 0) throw new Error("RGBA byte length must be divisible by four");
  const gray = new Uint8Array(rgba.byteLength / 4);
  for (let source = 0, target = 0; source < rgba.byteLength; source += 4, target++) {
    gray[target] = (rgba[source]! * 77 + rgba[source + 1]! * 150 + rgba[source + 2]! * 29) >> 8;
  }
  return gray;
}

function createUniformData(context: T3DRenderContext): ArrayBuffer {
  const buffer = new ArrayBuffer(UNIFORM_BYTES);
  const floats = new Float32Array(buffer);
  const words = new Uint32Array(buffer);
  words[0] = context.pixelWidth;
  words[1] = context.pixelHeight;
  floats[2] = context.timeMs / 1000;
  floats[3] = context.deltaMs / 1000;
  floats[4] = context.motion.yaw;
  floats[5] = context.motion.pitch;
  floats[6] = context.motion.yawVelocity;
  floats[7] = context.motion.pitchVelocity;
  floats[8] = context.motion.pointerX;
  floats[9] = context.motion.pointerY;
  floats[10] = context.motion.pointerSpeed;
  floats[11] = context.motion.hovering ? 1 : 0;
  words[12] = context.frame >>> 0;
  floats[13] = Number.isFinite(context.motion.zoom) ? context.motion.zoom : 1;
  floats[14] = Number.isFinite(context.motion.zoomVelocity) ? context.motion.zoomVelocity : 0;
  words[16] = context.motion.hoveredObjectId == null ? 0xffffffff : context.motion.hoveredObjectId >>> 0;
  words[17] = context.motion.selectedObjectId == null ? 0xffffffff : context.motion.selectedObjectId >>> 0;
  return buffer;
}

async function createRendererState(
  shader: string,
  textureData: BunWebGPUTextureData | undefined,
  label: string,
): Promise<RendererState> {
  const gpu = await ensureWebGPU();
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error(`${label}: WebGPU adapter unavailable`);
  const device = await adapter.requestDevice();

  device.pushErrorScope("validation");
  const module = device.createShaderModule({ label: `${label}:shader`, code: shader });
  const pipeline = device.createComputePipeline({
    label: `${label}:pipeline`,
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });
  const validationError = await device.popErrorScope();
  if (validationError) {
    pipeline.destroy?.();
    device.destroy();
    throw new Error(`${label}: WGSL validation failed: ${validationError.message}`);
  }

  const { GPUBufferUsage, GPUTextureUsage } = globalConstructors;
  const uniforms = device.createBuffer({
    label: `${label}:uniforms`,
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  if (!textureData) return { device, pipeline, uniforms };

  const texture = device.createTexture({
    label: `${label}:texture`,
    size: { width: textureData.width, height: textureData.height, depthOrArrayLayers: 1 },
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    textureData.rgba,
    { offset: 0, bytesPerRow: textureData.width * 4, rowsPerImage: textureData.height },
    { width: textureData.width, height: textureData.height, depthOrArrayLayers: 1 },
  );
  return { device, pipeline, uniforms, texture, textureView: texture.createView() };
}

function createRenderResources(
  state: RendererState,
  width: number,
  height: number,
  label: string,
): RenderResources {
  const { GPUBufferUsage } = globalConstructors;
  const byteLength = width * height * 4;
  const output = state.device.createBuffer({
    label: `${label}:output`,
    size: byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readback = state.device.createBuffer({
    label: `${label}:readback`,
    size: byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const entries: Array<Record<string, unknown>> = [
    { binding: 0, resource: { buffer: state.uniforms } },
    { binding: 1, resource: { buffer: output } },
  ];
  if (state.textureView) entries.push({ binding: 2, resource: state.textureView });
  const bindGroup = state.device.createBindGroup({
    label: `${label}:bindings`,
    layout: state.pipeline.getBindGroupLayout(0),
    entries,
  });
  return { width, height, byteLength, output, readback, bindGroup };
}

function destroyRenderResources(resources: RenderResources | undefined): void {
  resources?.bindGroup.destroy?.();
  resources?.output.destroy();
  resources?.readback.destroy();
}

function frameFromRgba(rgba: Uint8Array, context: T3DRenderContext): TVideoFrame {
  const timestampMs = Math.max(0, context.timeMs);
  if (context.format === "gray8") {
    const pixels = rgbaToGray8(rgba);
    return {
      format: "gray8",
      pixels,
      pixelWidth: context.pixelWidth,
      pixelHeight: context.pixelHeight,
      timestampMs,
      fingerprint: fingerprint(pixels),
    };
  }

  const png = encodeRgbaPng(rgba, context.pixelWidth, context.pixelHeight);
  return {
    png,
    pixelWidth: context.pixelWidth,
    pixelHeight: context.pixelHeight,
    timestampMs,
    fingerprint: fingerprint(rgba),
  };
}

/** Creates a Bun-only Pull renderer backed by a raw WGSL compute shader. */
export function createBunWebGPU3DRenderer(options: BunWebGPU3DRendererOptions): T3DRenderer {
  const shader = options.shader.trim();
  if (!shader) throw new Error("createBunWebGPU3DRenderer requires non-empty WGSL shader code");
  const textureData = normalizeTextureData(options.texture);
  const label = options.label?.trim() || "T3DViewport";
  let disposed = false;
  let rendering = false;
  let stateDestroyed = false;
  let statePromise: Promise<RendererState> | undefined;
  let state: RendererState | undefined;
  let resources: RenderResources | undefined;

  function destroyReadyState(): void {
    if (rendering) return;
    destroyRenderResources(resources);
    resources = undefined;
    if (!state || stateDestroyed) return;
    stateDestroyed = true;
    state.uniforms.destroy();
    state.texture?.destroy();
    state.pipeline.destroy?.();
    state.device.destroy();
    state = undefined;
  }

  async function rendererState(): Promise<RendererState> {
    if (disposed) throw new Error(`${label}: renderer is disposed`);
    statePromise ??= createRendererState(shader, textureData, label).then((next) => {
      state = next;
      return next;
    });
    const next = await statePromise;
    if (disposed) throw new Error(`${label}: renderer is disposed`);
    return next;
  }

  return {
    async render(context) {
      if (disposed) throw new Error(`${label}: renderer is disposed`);
      if (rendering) {
        throw new Error(`${label}: concurrent render() calls are not supported`);
      }
      if (context.signal.aborted) throw abortError();
      rendering = true;
      try {
        const activeState = await rendererState();
        if (context.signal.aborted || disposed) throw abortError();

        if (
          !resources ||
          resources.width !== context.pixelWidth ||
          resources.height !== context.pixelHeight
        ) {
          destroyRenderResources(resources);
          resources = createRenderResources(
            activeState,
            context.pixelWidth,
            context.pixelHeight,
            label,
          );
        }

        activeState.device.queue.writeBuffer(activeState.uniforms, 0, createUniformData(context));
        const encoder = activeState.device.createCommandEncoder({
          label: `${label}:frame`,
        });
        const pass = encoder.beginComputePass({ label: `${label}:compute` });
        pass.setPipeline(activeState.pipeline);
        pass.setBindGroup(0, resources.bindGroup);
        pass.dispatchWorkgroups(
          Math.ceil(context.pixelWidth / WORKGROUP_SIZE),
          Math.ceil(context.pixelHeight / WORKGROUP_SIZE),
        );
        pass.end();
        encoder.copyBufferToBuffer(
          resources.output,
          0,
          resources.readback,
          0,
          resources.byteLength,
        );
        activeState.device.queue.submit([encoder.finish()]);

        await resources.readback.mapAsync(globalConstructors.GPUMapMode.READ);
        const rgba = new Uint8Array(resources.readback.getMappedRange()).slice();
        resources.readback.unmap();
        if (context.signal.aborted || disposed) throw abortError();
        return frameFromRgba(rgba, context);
      } finally {
        rendering = false;
        if (disposed) destroyReadyState();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      destroyReadyState();
      void statePromise?.then(destroyReadyState, () => {});
    },
  };
}

/** Creates the direction-E vue-tui terminal badge renderer. */
export function createTerminalBadge3DRenderer(
  options: TerminalBadge3DRendererOptions = {},
): T3DRenderer {
  const renderer = createBunWebGPU3DRenderer({
    shader: terminalBadge3DWgsl,
    texture: contributorAvatarAtlas,
    label: options.label ?? "VueTuiTerminalBadge3D",
  });
  return { ...renderer, hitTest: pickTerminalBadgeContributor };
}
