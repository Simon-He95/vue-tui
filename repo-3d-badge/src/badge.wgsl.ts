/**
 * WGSL shader for the repo 3D badge.
 *
 * This reuses the vue-tui terminal-badge material framework (extruded SDF
 * raymarch + brushed-metal/gloss/rim shading + soft shadows + AO) but
 * replaces the hardcoded Vue triangle logo with a *texture-sampled* logo:
 *
 *   - Logo SHAPE comes from the alpha channel of `repoBadgeAtlas` (binding 2),
 *     which carries a normalized signed distance field of the logo mask.
 *     `logoDistance()` samples it and rescales to world units, so any logo
 *     gets the same extruded, beveled 3D extrusion as the Vue original.
 *
 *   - Logo COLOR comes from the RGB channels of the same texture, sampled in
 *     `logoMaterial()` — so each repo keeps its own brand colors while still
 *     getting the brushed-metal / gloss / rim treatment.
 *
 *   - Contributor avatars live in a second region of the same atlas texture
 *     (the renderer packs logo SDF + avatar tiles into one texture because
 *     createBunWebGPU3DRenderer exposes a single sampled binding).
 *
 * The contributor sphere array is injected at shader-build time so the scene
 * adapts to any repo's contributor count and layout.
 */

import type { ContributorSphere } from "./types.js";

export interface BadgeSceneWgslInput {
  /** Contributor spheres, already laid out by the scene module. */
  spheres: readonly ContributorSphere[];
  /** Pixel size of the logo SDF tile inside the atlas. */
  logoTileSize: number;
  /** Pixel size of each avatar tile inside the atlas. */
  avatarTileSize: number;
  /** Tiles per row in the avatar region. */
  avatarColumns: number;
  /** Total atlas width in pixels (logo region + avatar region). */
  atlasWidth: number;
  /** Total atlas height in pixels. */
  atlasHeight: number;
  /** Logo aspect (width / height) used to fit the extrusion into the scene. */
  logoAspect: number;
  /** When true, render logo as extruded rounded-rect board with texture
   *  instead of SDF shape extrusion. Used for thin-text logos whose SDF
   *  has too few inside pixels for reliable raymarching. */
  boardMode?: boolean;
}

function spheresWgsl(spheres: readonly ContributorSphere[]): string {
  if (spheres.length === 0) {
    // WGSL requires at least one element in a fixed-size array.
    return "  vec4f(0.0, 0.0, -100.0, 0.0)";
  }
  return spheres
    .map(
      (s) =>
        `  vec4f(${s.x.toFixed(6)}, ${s.y.toFixed(6)}, ${s.z.toFixed(6)}, ${s.radius.toFixed(6)})`,
    )
    .join(",\n");
}

export function buildBadgeSceneWgsl(input: BadgeSceneWgslInput): string {
  const count = Math.max(1, input.spheres.length);
  const centers = spheresWgsl(input.spheres);
  // Fit the logo into world space so it fills the view regardless of aspect
  // ratio. The original vue badge uses a near-square logo (aspect ~0.87). For
  // very wide banners (e.g. lynx at 3.46:1), fitting the larger dimension to
  // 0.59 makes the other dimension tiny. Instead: ensure the smaller
  // dimension is at least MIN_HALF, letting the larger dimension grow.
  const MIN_HALF = 0.38;
  const aspect = Math.max(0.01, input.logoAspect);
  let logoHalfW: number;
  let logoHalfH: number;
  if (aspect >= 1) {
    logoHalfH = Math.max(MIN_HALF, 0.59 / aspect);
    logoHalfW = logoHalfH * aspect;
  } else {
    logoHalfW = Math.max(MIN_HALF, 0.59 * aspect);
    logoHalfH = logoHalfW / aspect;
  }

  const boardMode = input.boardMode ?? false;

  return /* wgsl */ `
struct Uniforms {
  resolution: vec2u,
  time: f32,
  delta: f32,
  yaw: f32,
  pitch: f32,
  yawVelocity: f32,
  pitchVelocity: f32,
  pointerX: f32,
  pointerY: f32,
  pointerSpeed: f32,
  hovering: f32,
  frame: u32,
  zoom: f32,
  zoomVelocity: f32,
  padding: u32,
  hoveredObjectId: u32,
  selectedObjectId: u32,
  interactionPadding: vec2u,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> outputPixels: array<u32>;
@group(0) @binding(2) var repoBadgeAtlas: texture_2d<f32>;

const BOARD_MODE: u32 = ${boardMode ? "1u" : "0u"};

const PI: f32 = 3.14159265;
const CONTRIBUTOR_COUNT: u32 = ${count}u;
const LOGO_TILE_SIZE: i32 = ${input.logoTileSize};
const AVATAR_TILE_SIZE: i32 = ${input.avatarTileSize};
const AVATAR_COLUMNS: i32 = ${input.avatarColumns};
const ATLAS_WIDTH: i32 = ${input.atlasWidth};
const ATLAS_HEIGHT: i32 = ${input.atlasHeight};
const LOGO_HALF_W: f32 = ${logoHalfW.toFixed(6)};
const LOGO_HALF_H: f32 = ${logoHalfH.toFixed(6)};
const LOGO_EXTRUDE: f32 = 0.07;
const LOGO_BEVEL: f32 = 0.012;

const CONTRIBUTOR_CENTERS = array<vec4f, ${count}>(
${centers}
);

fn rotate2(point: vec2f, angle: f32) -> vec2f {
  let c = cos(angle);
  let s = sin(angle);
  return vec2f(c * point.x - s * point.y, s * point.x + c * point.y);
}

// ---------------------------------------------------------------------------
// Logo: texture-sampled SDF shape + RGB color
// ---------------------------------------------------------------------------

/// Map a world-space logo-local point to the logo SDF texture UV.
fn logoUv(point: vec2f) -> vec2f {
  let u = clamp(point.x / (LOGO_HALF_W * 2.0) + 0.5, 0.0, 1.0);
  let v = clamp(point.y / (LOGO_HALF_H * 2.0) + 0.5, 0.0, 1.0);
  // SDF was built top-left origin; flip V for texture sampling.
  return vec2f(u, 1.0 - v);
}

/// Sample the logo SDF (alpha channel) and rescale to world units.
/// Returns negative inside the logo, positive outside, ~0 at the boundary.
/// In board mode, uses a rounded-rectangle SDF instead of the texture SDF
/// (for thin-text logos that can't be raymarched reliably from a texture SDF).
fn logoDistance(point: vec2f) -> f32 {
  if (BOARD_MODE == 1u) {
    // Rounded rectangle matching the logo aspect ratio.
    let cornerRadius = min(LOGO_HALF_W, LOGO_HALF_H) * 0.12;
    let q = abs(point) - (vec2f(LOGO_HALF_W, LOGO_HALF_H) - vec2f(cornerRadius));
    return min(max(q.x, q.y), 0.0) + length(max(q, vec2f(0.0))) - cornerRadius;
  }
  let uv = logoUv(point);
  let tx = i32(clamp(uv.x, 0.0, 1.0) * f32(LOGO_TILE_SIZE - 1));
  let ty = i32(clamp(uv.y, 0.0, 1.0) * f32(LOGO_TILE_SIZE - 1));
  let sampled = textureLoad(repoBadgeAtlas, vec2i(tx, ty), 0).a;
  // sampled: 0..1, 0.5 = boundary, <0.5 inside, >0.5 outside.
  // Rescale: the SDF was normalized to [-1,1] then encoded.
  let normalized = sampled * 2.0 - 1.0;
  // Scale normalized [-1,1] to world half-diagonal.
  let scale = max(LOGO_HALF_W, LOGO_HALF_H);
  return normalized * scale;
}

/// Sample the logo RGB color at a world-space point.
/// In board mode, the logo texture's transparent areas become a brushed metal
/// plate color so the board looks like an enamel badge, not a black slab.
fn logoColor(point: vec2f) -> vec3f {
  let uv = logoUv(point);
  let tx = i32(clamp(uv.x, 0.0, 1.0) * f32(LOGO_TILE_SIZE - 1));
  let ty = i32(clamp(uv.y, 0.0, 1.0) * f32(LOGO_TILE_SIZE - 1));
  let texel = textureLoad(repoBadgeAtlas, vec2i(tx, ty), 0);
  if (BOARD_MODE == 1u) {
    // Use the SDF alpha to determine if this is a logo pixel or plate pixel.
    let sdf = texel.a * 2.0 - 1.0;
    // Brushed metal plate color (similar to vue-tui's vueSlate).
    let plate = vec3f(0.2078, 0.2863, 0.3686);
    return select(plate, texel.rgb, sdf < 0.0);
  }
  return texel.rgb;
}

/// Extruded 2D SDF -> 3D SDF with beveled side, same structure as vue-tui.
fn logoExtrudedDistance(point: vec3f) -> f32 {
  let face = logoDistance(point.xy);
  let side = abs(point.z) - LOGO_EXTRUDE;
  return max(max(face, side), (face + side + LOGO_BEVEL) * 0.70710678);
}

fn logoLocal(value: vec3f) -> vec3f {
  let yawed = rotate2(value.xz, uniforms.yaw);
  let pitched = rotate2(vec2f(value.y, yawed.y), uniforms.pitch);
  return vec3f(yawed.x, pitched.x, pitched.y);
}

fn logoLocalDirection(direction: vec3f) -> vec3f {
  return logoLocal(direction);
}

fn logoWorldDirection(direction: vec3f) -> vec3f {
  let unpitched = rotate2(direction.yz, -uniforms.pitch);
  let unyawed = rotate2(vec2f(direction.x, unpitched.y), -uniforms.yaw);
  return vec3f(unyawed.x, unpitched.x, unyawed.y);
}

fn contributorCenter(index: u32) -> vec3f {
  return CONTRIBUTOR_CENTERS[index].xyz;
}

fn contributorRadius(index: u32) -> f32 {
  let base = CONTRIBUTOR_CENTERS[index].w;
  if (index == uniforms.selectedObjectId) {
    return base * 2.3;
  }
  if (index == uniforms.hoveredObjectId) {
    return base * 1.8;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Scene (logo + backing wall)
// ---------------------------------------------------------------------------

fn baseScene(point: vec3f) -> vec2f {
  let logo = logoExtrudedDistance(logoLocal(point));
  let wall = abs(point.z + 0.82) - 0.018;
  return select(vec2f(wall, 2.0), vec2f(logo, 1.0), logo < wall);
}

fn baseSceneNormal(point: vec3f) -> vec3f {
  let epsilon = 0.0012;
  let center = baseScene(point).x;
  return normalize(vec3f(
    center - baseScene(point - vec3f(epsilon, 0.0, 0.0)).x,
    center - baseScene(point - vec3f(0.0, epsilon, 0.0)).x,
    center - baseScene(point - vec3f(0.0, 0.0, epsilon)).x,
  ));
}

fn baseSoftShadow(origin: vec3f, direction: vec3f) -> f32 {
  var result = 1.0;
  var distance = 0.02;
  for (var step = 0; step < 36; step++) {
    let height = baseScene(origin + direction * distance).x;
    if (height < 0.001) {
      return 0.0;
    }
    result = min(result, 18.0 * height / distance);
    distance += clamp(height, 0.02, 0.2);
    if (distance > 3.0) {
      break;
    }
  }
  return clamp(result, 0.0, 1.0);
}

fn baseAmbientOcclusion(point: vec3f, normal: vec3f) -> f32 {
  var occlusion = 0.0;
  var scale = 1.0;
  for (var step = 0; step < 5; step++) {
    let sampleDistance = 0.02 + 0.13 * f32(step);
    occlusion += (sampleDistance - baseScene(point + normal * sampleDistance).x) * scale;
    scale *= 0.72;
  }
  return clamp(1.0 - 1.4 * occlusion, 0.0, 1.0);
}

// ---------------------------------------------------------------------------
// Contributor avatar sampling (second region of the atlas)
// ---------------------------------------------------------------------------

fn sampleContributorAvatar(index: u32, uv: vec2f) -> vec3f {
  if (index >= CONTRIBUTOR_COUNT) {
    return vec3f(0.3, 0.3, 0.35);
  }
  let tile = vec2i(i32(index) % AVATAR_COLUMNS, i32(index) / AVATAR_COLUMNS);
  // Avatar region starts at x = LOGO_TILE_SIZE (logo occupies the left column).
  let tileOrigin = vec2i(LOGO_TILE_SIZE, 0) + tile * AVATAR_TILE_SIZE;
  let texel = clamp(uv, vec2f(0.0), vec2f(1.0)) * f32(AVATAR_TILE_SIZE - 1);
  let first = vec2i(floor(texel));
  let second = min(first + vec2i(1), vec2i(AVATAR_TILE_SIZE - 1));
  let weight = fract(texel);
  let top = mix(
    textureLoad(repoBadgeAtlas, tileOrigin + vec2i(first.x, first.y), 0).rgb,
    textureLoad(repoBadgeAtlas, tileOrigin + vec2i(second.x, first.y), 0).rgb,
    weight.x,
  );
  let bottom = mix(
    textureLoad(repoBadgeAtlas, tileOrigin + vec2i(first.x, second.y), 0).rgb,
    textureLoad(repoBadgeAtlas, tileOrigin + second, 0).rgb,
    weight.x,
  );
  return mix(top, bottom, weight.y);
}

fn raySphere(rayOrigin: vec3f, rayDirection: vec3f, sphere: vec4f) -> f32 {
  let offset = rayOrigin - sphere.xyz;
  let projection = dot(offset, rayDirection);
  let discriminant = projection * projection - (dot(offset, offset) - sphere.w * sphere.w);
  if (discriminant < 0.0) {
    return 1e9;
  }
  let root = sqrt(discriminant);
  let nearDistance = -projection - root;
  let farDistance = -projection + root;
  return select(select(1e9, farDistance, farDistance > 0.001), nearDistance, nearDistance > 0.001);
}

fn contributorIntersection(rayOrigin: vec3f, rayDirection: vec3f) -> vec2f {
  var closest = vec2f(1e9, -1.0);
  for (var index = 0u; index < CONTRIBUTOR_COUNT; index++) {
    let sphere = vec4f(contributorCenter(index), contributorRadius(index));
    let distance = raySphere(rayOrigin, rayDirection, sphere);
    if (distance < closest.x) {
      closest = vec2f(distance, f32(index));
    }
  }
  return closest;
}

fn hash21(point: vec2f) -> f32 {
  let source = fract(point * vec2f(123.34, 456.21));
  let mixed = source + dot(source, source + vec2f(45.32));
  return fract(mixed.x * mixed.y);
}

fn background(rayDirection: vec3f) -> vec3f {
  let vertical = 0.5 + 0.5 * rayDirection.y;
  return mix(vec3f(0.025, 0.03, 0.04), vec3f(0.07, 0.09, 0.11), vertical) +
    vec3f(0.02, 0.05, 0.04) * pow(max(0.0, 1.0 - abs(rayDirection.y)), 3.0);
}

// ---------------------------------------------------------------------------
// Materials (reused from vue-tui framework)
// ---------------------------------------------------------------------------

fn logoMaterial(point: vec3f, normal: vec3f, rayDirection: vec3f) -> vec3f {
  let local = logoLocal(point);
  let localNormal = logoLocalDirection(normal);
  // Dynamic logo color from texture instead of hardcoded vueGreen/vueSlate.
  let baseColor = logoColor(local.xy);
  var base = baseColor;

  let face = smoothstep(0.72, 0.96, abs(localNormal.z));
  let brushed = sin(local.y * 150.0 + local.x * 22.0) * 0.018;
  let grain = hash21(floor((local.xy + vec2f(13.7)) * 240.0)) - 0.5;
  base *= 1.0 + face * (brushed + grain * 0.025);

  let lightDirection = normalize(vec3f(
    -0.45 + 0.16 * sin(uniforms.time * 0.7) + uniforms.pointerX * 0.12,
    0.78 - uniforms.pointerY * 0.08,
    0.62,
  ));
  let halfDirection = normalize(lightDirection - rayDirection);
  let gloss = pow(max(dot(normal, halfDirection), 0.0), 44.0);
  let speedGlow = clamp(uniforms.pointerSpeed * 0.014, 0.0, 0.32);
  let edge = pow(1.0 - abs(dot(normal, rayDirection)), 3.0);
  // Tint highlights with a warm white that works for any base color.
  return base + vec3f(0.62, 0.92, 0.82) * gloss * (0.34 + speedGlow) +
    vec3f(0.12, 0.48, 0.34) * edge * (0.14 + speedGlow);
}

fn contributorMaterial(
  index: u32,
  point: vec3f,
  normal: vec3f,
  worldNormal: vec3f,
  rayOrigin: vec3f,
  worldRayDirection: vec3f,
) -> vec3f {
  let center = contributorCenter(index);
  let forward = normalize(rayOrigin - center);
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), forward));
  let up = normalize(cross(forward, right));
  let localX = dot(normal, right);
  let localY = dot(normal, up);
  let localZ = dot(normal, forward);
  let sphereUv = vec2f(
    clamp(0.5 + atan2(localX, localZ) / PI, 0.0, 1.0),
    clamp(0.5 - asin(clamp(localY, -1.0, 1.0)) / PI, 0.0, 1.0),
  );
  let portraitUv = clamp(vec2f(0.5 + localX * 0.48, 0.5 - localY * 0.48), vec2f(0.0), vec2f(1.0));
  // Index 0 = repo owner; use portrait UV for a face-forward avatar.
  let avatar = sampleContributorAvatar(index, select(sphereUv, portraitUv, index == 0u));
  let lightDirection = normalize(vec3f(-0.42, 0.76, 0.64));
  let halfDirection = normalize(lightDirection - worldRayDirection);
  let diffuse = clamp(dot(worldNormal, lightDirection), 0.0, 1.0);
  let gloss = pow(max(dot(worldNormal, halfDirection), 0.0), 42.0);
  let rim = pow(1.0 - clamp(dot(worldNormal, -worldRayDirection), 0.0, 1.0), 3.0);
  let glassTint = vec3f(0.32, 0.92, 0.7);
  let focusDim = select(
    1.0,
    0.52,
    uniforms.selectedObjectId != 0xffffffffu && index != uniforms.selectedObjectId,
  );
  let surface = focusDim * (
    avatar * (0.56 + diffuse * 0.62 + rim * 0.12) +
    glassTint * (gloss * 0.36 + rim * 0.08)
  );
  let creatorRim = select(
    vec3f(0.0),
    vec3f(1.0, 0.85, 0.3) * rim * 0.6,
    index == 0u,
  );
  return surface + creatorRim;
}

// ---------------------------------------------------------------------------
// Pixel render
// ---------------------------------------------------------------------------

fn renderPixel(pixel: vec2u) -> vec4f {
  let size = vec2f(uniforms.resolution);
  let fragment = vec2f(
    f32(pixel.x) + 0.5,
    f32(uniforms.resolution.y - 1u - pixel.y) + 0.5,
  );
  let uv = (fragment - size * 0.5) / size.y;
  let cameraDistance = 2.45 / max(uniforms.zoom, 0.01);
  let rayOrigin = vec3f(0.0, 0.02, cameraDistance);
  let rayDirection = normalize(vec3f(uv, -1.9));

  let contributorRayOrigin = logoLocal(rayOrigin);
  let contributorRayDirection = logoLocalDirection(rayDirection);
  let contributorHit = contributorIntersection(contributorRayOrigin, contributorRayDirection);
  let raymarchLimit = min(9.0, contributorHit.x);

  var distance = 0.0;
  var hit = vec2f(1e9, 0.0);
  for (var step = 0; step < 100; step++) {
    if (distance >= raymarchLimit) {
      break;
    }
    hit = baseScene(rayOrigin + rayDirection * distance);
    if (hit.x < 0.001) {
      break;
    }
    distance += hit.x * 0.88;
  }

  var color = background(rayDirection);
  let hitBase = hit.x < 0.001 && distance < contributorHit.x && distance <= 9.0;
  if (hitBase) {
    let point = rayOrigin + rayDirection * distance;
    let normal = baseSceneNormal(point);
    let lightDirection = normalize(vec3f(
      0.55 + uniforms.pointerX * 0.08,
      0.7 - uniforms.pointerY * 0.06,
      0.45,
    ));
    let diffuse = clamp(dot(normal, lightDirection), 0.0, 1.0);
    let shadow = baseSoftShadow(point + normal * 0.003, lightDirection);
    let occlusion = baseAmbientOcclusion(point, normal);
    let rim = pow(1.0 - clamp(dot(normal, -rayDirection), 0.0, 1.0), 2.0);

    if (hit.y > 1.5) {
      let wall = vec3f(0.055, 0.075, 0.078);
      color = wall * (0.22 * occlusion + 0.9 * diffuse * shadow) + wall * rim * 0.18;
    } else {
      let material = logoMaterial(point, normal, rayDirection);
      color = material * (0.22 * occlusion + 0.9 * diffuse * shadow) + material * rim * 0.18;
    }
  } else if (contributorHit.x <= 9.0) {
    let index = u32(round(contributorHit.y));
    let point = contributorRayOrigin + contributorRayDirection * contributorHit.x;
    let normal = normalize(point - contributorCenter(index));
    let worldNormal = logoWorldDirection(normal);
    color = contributorMaterial(
      index,
      point,
      normal,
      worldNormal,
      contributorRayOrigin,
      rayDirection,
    );
  }

  color = pow(max(color, vec3f(0.0)), vec3f(0.85));
  return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= uniforms.resolution.x || id.y >= uniforms.resolution.y) {
    return;
  }
  let index = id.y * uniforms.resolution.x + id.x;
  outputPixels[index] = pack4x8unorm(renderPixel(id.xy));
}
`;
}
