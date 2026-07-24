import type { T3DRenderContext, T3DViewportMotion } from "../src/experimental.js";
import {
  createBunWebGPU3DRenderer,
  createTerminalBadge3DRenderer,
  terminalBadge3DWgsl,
} from "../src/experimental/3d/bun.js";
import {
  contributorAvatarAtlas,
  contributorAvatarLogins,
} from "../src/experimental/3d/bun/contributor-avatar-atlas.js";

if (!globalThis.Bun) {
  throw new Error("smoke-bun-3d.ts must run with Bun");
}

const renderer = createTerminalBadge3DRenderer({ label: "VueTui3DSmoke" });
const controller = new AbortController();
const baseMotion: T3DViewportMotion = {
  yaw: -0.28,
  pitch: 0.13,
  yawVelocity: 0,
  pitchVelocity: 0,
  pointerX: 0,
  pointerY: 0,
  pointerSpeed: 0,
  hovering: false,
  zoom: 1,
  zoomVelocity: 0,
  hoveredObjectId: null,
  selectedObjectId: null,
};

function context(
  frame: number,
  motion: T3DViewportMotion,
  format: "gray8" | "png" = "gray8",
  size: Readonly<{ width: number; height: number }> = { width: 72, height: 44 },
): T3DRenderContext {
  return {
    timeMs: frame * 120,
    deltaMs: frame === 0 ? 0 : 120,
    frame,
    pixelWidth: size.width,
    pixelHeight: size.height,
    format,
    signal: controller.signal,
    motion,
  };
}

try {
  if (
    contributorAvatarLogins.length !== 100 ||
    new Set(contributorAvatarLogins).size !== contributorAvatarLogins.length
  ) {
    throw new Error("Expected 100 unique Vue contributors");
  }
  if (
    contributorAvatarAtlas.width !== 512 ||
    contributorAvatarAtlas.height !== 224 ||
    contributorAvatarAtlas.rgba.byteLength !== 512 * 224 * 4
  ) {
    throw new Error("Vue contributor avatar atlas dimensions are invalid");
  }
  if (!terminalBadge3DWgsl.includes("const CONTRIBUTOR_COUNT: u32 = 100u")) {
    throw new Error("3D shader contributor count is not 100");
  }

  const invalidTexture = () =>
    createBunWebGPU3DRenderer({
      shader: terminalBadge3DWgsl,
      texture: { width: 2, height: 2, rgba: new Uint8Array(15) },
    });
  try {
    invalidTexture();
    throw new Error("Invalid WebGPU texture bytes were accepted");
  } catch (error) {
    if (!String(error).includes("expected 16, got 15")) throw error;
  }

  const first = await renderer.render(context(0, baseMotion));
  if (first.format !== "gray8") throw new Error("Expected a gray8 smoke frame");
  if (first.pixelWidth !== 72 || first.pixelHeight !== 44) {
    throw new Error("Bun WebGPU smoke frame dimensions are incorrect");
  }
  const uniqueLuminance = new Set(first.pixels).size;
  if (uniqueLuminance < 8) {
    throw new Error(`Bun WebGPU smoke frame lacks scene detail (${uniqueLuminance} levels)`);
  }

  const blackAtlasRenderer = createBunWebGPU3DRenderer({
    shader: terminalBadge3DWgsl,
    texture: { width: 512, height: 224, rgba: new Uint8Array(512 * 224 * 4) },
    label: "VueTui3DBlackAtlasSmoke",
  });
  try {
    const blackAtlasFrame = await blackAtlasRenderer.render(context(0, baseMotion));
    if (blackAtlasFrame.format !== "gray8" || blackAtlasFrame.fingerprint === first.fingerprint) {
      throw new Error("Contributor avatar texture did not affect the 3D scene");
    }
  } finally {
    blackAtlasRenderer.dispose?.();
  }

  const moved = await renderer.render(
    context(1, {
      ...baseMotion,
      yaw: 0.72,
      pitch: -0.22,
      pointerX: 0.65,
      pointerY: -0.4,
      pointerSpeed: 24,
      hovering: true,
    }),
  );
  if (moved.format !== "gray8") throw new Error("Expected a second gray8 smoke frame");
  if (moved.fingerprint === first.fingerprint) {
    throw new Error("3D scene fingerprint did not change after orbit motion");
  }

  const zoomed = await renderer.render(context(2, { ...baseMotion, zoom: 1.45 }));
  if (zoomed.format !== "gray8" || zoomed.fingerprint === first.fingerprint) {
    throw new Error("3D scene fingerprint did not change after camera zoom");
  }

  for (const [frame, size] of [
    [3, { width: 96, height: 30 }],
    [4, { width: 30, height: 96 }],
  ] as const) {
    const zoomedOut = await renderer.render(
      context(frame, { ...baseMotion, zoom: 0.62 }, "gray8", size),
    );
    if (zoomedOut.format !== "gray8") throw new Error("Expected a gray8 zoom-out frame");
    const corners = [
      zoomedOut.pixels[0]!,
      zoomedOut.pixels[size.width - 1]!,
      zoomedOut.pixels[(size.height - 1) * size.width]!,
      zoomedOut.pixels[size.width * size.height - 1]!,
    ];
    if (Math.max(...corners) - Math.min(...corners) > 4) {
      throw new Error(
        `3D backing surface did not cover ${size.width}x${size.height} zoom-out corners: ${corners.join(", ")}`,
      );
    }
  }

  const png = await renderer.render(context(5, baseMotion, "png"));
  if (png.format === "gray8" || png.png.byteLength < 128) {
    throw new Error("Bun WebGPU PNG frame was not encoded");
  }

  process.stdout.write(
    `Bun WebGPU 3D smoke passed: ${first.pixelWidth}x${first.pixelHeight}, ${uniqueLuminance} luminance levels\n`,
  );
} finally {
  renderer.dispose?.();
}

const lifecycleRenderer = createTerminalBadge3DRenderer({ label: "VueTui3DLifecycleSmoke" });
const inFlight = lifecycleRenderer.render(context(3, baseMotion));
const concurrent = lifecycleRenderer.render(context(4, baseMotion));
lifecycleRenderer.dispose?.();
const [inFlightResult, concurrentResult] = await Promise.allSettled([inFlight, concurrent]);
if (inFlightResult.status !== "rejected") {
  throw new Error("Disposing during Bun WebGPU initialization did not reject the active render");
}
if (
  concurrentResult.status !== "rejected" ||
  !String(concurrentResult.reason).includes("concurrent render() calls")
) {
  throw new Error("Concurrent Bun WebGPU render calls did not fail fast");
}
const afterDispose = await Promise.allSettled([lifecycleRenderer.render(context(5, baseMotion))]);
if (
  afterDispose[0]?.status !== "rejected" ||
  !String(afterDispose[0].reason).includes("renderer is disposed")
) {
  throw new Error("Bun WebGPU renderer accepted a frame after dispose");
}
