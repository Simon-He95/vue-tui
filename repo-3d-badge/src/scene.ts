/**
 * Dynamic contributor sphere layout + object picking for the repo 3D badge.
 *
 * Generalizes vue-tui's fixed 100-contributor scene into a parameterized
 * layout that works for any contributor count. The repo owner (index 0) is
 * always the large centerpiece sphere; remaining contributors orbit in rings.
 */

import type { ContributorSphere, RepoContributor } from "./types.js";
import type {
  T3DHitResult,
  T3DHitTestContext,
  T3DViewportMotion,
} from "@simon_he/vue-tui/experimental";

const FOUNDER_INDEX = 0;
const FOUNDER_RADIUS_SCALE = 1.6;
const HOVER_SCALE = 1.8;
const SELECTED_SCALE = 2.3;
const FOUNDER_HOVER_SCALE = 1.3;
const FOUNDER_SELECTED_SCALE = 1.8;

export interface SceneLayout {
  spheres: readonly ContributorSphere[];
  /** Contributor logins aligned with sphere indices. */
  logins: readonly string[];
}

/**
 * Build a dynamic sphere layout for the given contributors.
 *
 * - Index 0 (repo owner / top contributor) sits at the center, larger.
 * - Remaining contributors fill concentric rings of up to 20 per ring,
 *   stepping inward in depth, matching the vue-tui badge rhythm.
 */
export function buildContributorScene(contributors: readonly RepoContributor[]): SceneLayout {
  const count = contributors.length;
  const logins = contributors.map((c) => c.login);
  const spheres: ContributorSphere[] = [];

  if (count === 0) return { spheres, logins };

  // Owner / top contributor centerpiece.
  spheres.push({
    index: 0,
    x: 0,
    y: 0.44,
    z: 0.38,
    radius: 0.074,
  });

  if (count === 1) return { spheres, logins };

  const contributorsPerRing = 20;
  const remaining = count - 1;
  const rings = Math.ceil(remaining / contributorsPerRing);

  let placed = 0;
  for (let ring = 0; ring < rings; ring++) {
    const inThisRing = Math.min(contributorsPerRing, remaining - placed);
    const radiusX = 0.7 + ring * 0.065;
    const radiusY = 0.46 + ring * 0.0275;
    const radius = Math.max(0.012, 0.022 - ring * 0.0004);
    const depthStep = ring * 0.045;

    for (let slot = 0; slot < inThisRing; slot++) {
      const angle = (slot / contributorsPerRing) * Math.PI * 2 + (ring * Math.PI) / 20;
      const depthJitter = ((slot + ring * 7) % 3) - 1;
      spheres.push({
        index: placed + 1,
        x: Math.cos(angle) * radiusX,
        y: Math.sin(angle) * radiusY + 0.02,
        z: 0.28 - depthStep + depthJitter * 0.008,
        radius,
      });
      placed++;
    }
  }

  return { spheres, logins };
}

/** Radius scale per index (owner gets larger base). */
function radiusScale(index: number): number {
  return index === FOUNDER_INDEX ? FOUNDER_RADIUS_SCALE : 1;
}

function sphereScale(index: number, motion: T3DViewportMotion): number {
  const base = radiusScale(index);
  if (motion.selectedObjectId === index) {
    return base * (index === FOUNDER_INDEX ? FOUNDER_SELECTED_SCALE : SELECTED_SCALE);
  }
  if (motion.hoveredObjectId === index) {
    return base * (index === FOUNDER_INDEX ? FOUNDER_HOVER_SCALE : HOVER_SCALE);
  }
  return base;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function rotate2(x: number, y: number, angle: number): readonly [number, number] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [cosine * x - sine * y, sine * x + cosine * y];
}

function sceneLocal(
  value: readonly [number, number, number],
  motion: T3DViewportMotion,
): readonly [number, number, number] {
  const yawed = rotate2(value[0], value[2], finite(motion.yaw, 0));
  const pitched = rotate2(value[1], yawed[1], finite(motion.pitch, 0));
  return [yawed[0], pitched[0], pitched[1]];
}

function normalize3(x: number, y: number, z: number): readonly [number, number, number] {
  const length = Math.hypot(x, y, z);
  return length > 0 ? [x / length, y / length, z / length] : [0, 0, -1];
}

function raySphere(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  sphere: ContributorSphere,
  radius: number,
): number {
  const offsetX = origin[0] - sphere.x;
  const offsetY = origin[1] - sphere.y;
  const offsetZ = origin[2] - sphere.z;
  const projection = offsetX * direction[0] + offsetY * direction[1] + offsetZ * direction[2];
  const discriminant =
    projection * projection -
    (offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ - radius * radius);
  if (discriminant < 0) return Number.POSITIVE_INFINITY;
  const root = Math.sqrt(discriminant);
  const nearDistance = -projection - root;
  if (nearDistance > 0.001) return nearDistance;
  const farDistance = -projection + root;
  return farDistance > 0.001 ? farDistance : Number.POSITIVE_INFINITY;
}

/**
 * Synchronous object picking: ray-cast against the contributor spheres.
 * Returns the closest hit with the contributor's login + GitHub URL.
 */
export function createBadgeHitTest(layout: SceneLayout) {
  const spheres = layout.spheres;
  const logins = layout.logins;

  return function hitTest(context: T3DHitTestContext): T3DHitResult | null {
    if (spheres.length === 0) return null;

    const pixelWidth = Math.max(1, Math.floor(finite(context.pixelWidth, 1)));
    const pixelHeight = Math.max(1, Math.floor(finite(context.pixelHeight, 1)));
    const cellHeight = Math.max(1, Math.floor(finite(context.cellHeight, 1)));
    const zoom = Math.max(0.01, finite(context.motion.zoom, 1));
    const cameraDistance = 2.45 / zoom;
    const uvX = finite(context.pointerX, 0) * 0.5 * (pixelWidth / pixelHeight);
    const uvY = -finite(context.pointerY, 0) * 0.5;
    const worldDirection = normalize3(uvX, uvY, -1.9);
    const rayOrigin = sceneLocal([0, 0.02, cameraDistance], context.motion);
    const rayDirection = sceneLocal(worldDirection, context.motion);

    let closestDistance = Number.POSITIVE_INFINITY;
    let closestIndex = -1;
    for (let index = 0; index < spheres.length; index++) {
      const sphere = spheres[index]!;
      if (!sphere) continue;
      const visualRadius = sphere.radius * sphereScale(index, context.motion);
      const cellPickRadius = (Math.max(0.1, cameraDistance - sphere.z) / 1.9 / cellHeight) * 0.72;
      const distance = raySphere(
        rayOrigin,
        rayDirection,
        sphere,
        Math.max(visualRadius, cellPickRadius),
      );
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }

    if (closestIndex < 0) return null;
    const login = logins[closestIndex];
    if (!login) return null;
    return {
      objectId: closestIndex,
      label: login,
      href: `https://github.com/${login}`,
    };
  };
}
