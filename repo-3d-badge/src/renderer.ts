/**
 * Assembles the repo 3D badge renderer.
 *
 * Packs the logo SDF texture + contributor avatar atlas into a single
 * sampled texture (because createBunWebGPU3DRenderer exposes one texture
 * binding), builds the WGSL shader with the dynamic scene layout, and
 * returns a ready-to-use T3DRenderer with hit testing.
 */

import {
  createBunWebGPU3DRenderer,
  type BunWebGPUTextureData,
} from "@simon_he/vue-tui/experimental/3d/bun";
import type { T3DRenderer } from "@simon_he/vue-tui/experimental";
import { buildBadgeSceneWgsl } from "./badge.wgsl.js";
import { buildContributorScene, createBadgeHitTest } from "./scene.js";
import { buildAvatarAtlas } from "./image.js";
import { buildLogoSdfTexture } from "./sdf.js";
import { generateLogoFallback } from "./image.js";
import type { AvatarAtlasTexture, LogoSdfTexture, Repo3DData } from "./types.js";

const LOGO_SDF_SIZE = 128;
const AVATAR_TILE_SIZE = 32;

export interface RepoBadgeRendererOptions {
  /** Label for WebGPU resources / error messages. */
  label?: string;
  /** Per-avatar fetch timeout in ms (passed to buildAvatarAtlas). */
  avatarTimeoutMs?: number;
}

export interface RepoBadgeBuildResult {
  renderer: T3DRenderer;
  /** The scene layout used (for status display etc.). */
  contributorCount: number;
  logoSource: string;
  /** True if the logo was rendered as a textured board (thin-text fallback). */
  boardMode: boolean;
}

/**
 * Build a complete T3DRenderer for the given repo data.
 *
 * Pipeline:
 *   1. Ensure a real logo bitmap (generate a monogram fallback if needed).
 *   2. Build the logo SDF texture (RGBA: color + distance field).
 *   3. Build the avatar atlas texture from contributor avatars.
 *   4. Pack both into one combined texture (logo left, avatars right).
 *   5. Build the WGSL shader with the dynamic contributor layout.
 *   6. Create the WebGPU renderer + attach hit testing.
 */
export async function createRepoBadgeRenderer(
  data: Repo3DData,
  options: RepoBadgeRendererOptions = {},
): Promise<RepoBadgeBuildResult> {
  const label = options.label ?? "RepoBadge3D";

  // 1. Logo bitmap — fall back to a generated monogram if none was resolved.
  let logo = data.logo;
  if (logo.width === 0 || logo.rgba.byteLength === 0) {
    logo = generateLogoFallback(data.meta);
  }

  // 2. Logo SDF texture.
  const logoSdf: LogoSdfTexture = buildLogoSdfTexture(logo, LOGO_SDF_SIZE);

  // 2b. Check if the SDF has enough "inside" pixels for reliable raymarching.
  // Thin-text logos (e.g. the Vue wordmark) may have < 5% inside pixels in the
  // SDF texture — the raymarcher steps right over them. Fall back to a solid
  // extruded board (rounded rectangle) with the logo texture on the front face.
  let insidePixels = 0;
  for (let i = 3; i < logoSdf.rgba.length; i += 4) {
    if (logoSdf.rgba[i]! < 120) insidePixels++;
  }
  const insideRatio = insidePixels / (logoSdf.width * logoSdf.height);
  const boardMode = insideRatio < 0.2;

  // 3. Avatar atlas.
  const avatarAtlas: AvatarAtlasTexture = await buildAvatarAtlas(
    data.contributors,
    AVATAR_TILE_SIZE,
    options.avatarTimeoutMs ?? 15000,
  );

  // 4. Pack logo SDF (left) + avatar atlas (right) into one texture.
  const logoW = logoSdf.width;
  const logoH = logoSdf.height;
  const avatarW = avatarAtlas.width;
  const avatarH = avatarAtlas.height;
  const atlasW = logoW + avatarW;
  const atlasH = Math.max(logoH, avatarH);

  const combined = new Uint8Array(atlasW * atlasH * 4);
  // Blit logo SDF at (0, 0).
  blit(combined, atlasW, atlasH, logoSdf.rgba, logoW, logoH, 0, 0);
  // Blit avatar atlas at (logoW, 0), vertically centered.
  blit(
    combined,
    atlasW,
    atlasH,
    avatarAtlas.rgba,
    avatarW,
    avatarH,
    logoW,
    Math.max(0, (atlasH - avatarH) / 2),
  );

  const texture: BunWebGPUTextureData = {
    width: atlasW,
    height: atlasH,
    rgba: combined,
  };

  // 5. Scene layout + shader.
  const scene = buildContributorScene(data.contributors);
  const shader = buildBadgeSceneWgsl({
    spheres: scene.spheres,
    logoTileSize: LOGO_SDF_SIZE,
    avatarTileSize: AVATAR_TILE_SIZE,
    avatarColumns: avatarAtlas.columns,
    atlasWidth: atlasW,
    atlasHeight: atlasH,
    logoAspect: logo.width / Math.max(1, logo.height),
    boardMode,
  });

  // 6. Renderer + hit test.
  const renderer = createBunWebGPU3DRenderer({
    shader,
    texture,
    label,
  });

  const hitTest = createBadgeHitTest(scene);

  return {
    renderer: { ...renderer, hitTest },
    contributorCount: data.contributors.length,
    logoSource: logo.source,
    boardMode,
  };
}

/** Copy a source bitmap into a region of a larger destination buffer. */
function blit(
  dest: Uint8Array,
  destW: number,
  destH: number,
  src: Uint8Array,
  srcW: number,
  srcH: number,
  offsetX: number,
  offsetY: number,
): void {
  for (let y = 0; y < srcH; y++) {
    const dy = offsetY + y;
    if (dy < 0 || dy >= destH) continue;
    for (let x = 0; x < srcW; x++) {
      const dx = offsetX + x;
      if (dx < 0 || dx >= destW) continue;
      const srcIdx = (y * srcW + x) * 4;
      const destIdx = (dy * destW + dx) * 4;
      dest[destIdx] = src[srcIdx]!;
      dest[destIdx + 1] = src[srcIdx + 1]!;
      dest[destIdx + 2] = src[srcIdx + 2]!;
      dest[destIdx + 3] = src[srcIdx + 3]!;
    }
  }
}
