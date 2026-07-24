import type {
  T3DHitResult,
  T3DHitTestContext,
  T3DViewportMotion,
} from "../../../vue/components/T3DViewport.js";
import { contributorAvatarLogins } from "./contributor-avatar-atlas.js";

export const TERMINAL_BADGE_CONTRIBUTOR_COUNT = 100;
const CONTRIBUTORS_PER_RING = 20;
const FOUNDER_INDEX = 0;
const FOUNDER_RADIUS_SCALE = 1.6;
const HOVER_SCALE = 1.8;
const SELECTED_SCALE = 2.3;
const FOUNDER_HOVER_SCALE = 1.3;
const FOUNDER_SELECTED_SCALE = 1.8;

export const terminalBadgeContributorRadiusScales: readonly number[] = Array.from(
  { length: TERMINAL_BADGE_CONTRIBUTOR_COUNT },
  (_, index) => (index === FOUNDER_INDEX ? FOUNDER_RADIUS_SCALE : 1),
);

export type TerminalBadgeContributorSphere = Readonly<{
  x: number;
  y: number;
  z: number;
  radius: number;
}>;

export const terminalBadgeContributorSpheres: readonly TerminalBadgeContributorSphere[] =
  Array.from({ length: TERMINAL_BADGE_CONTRIBUTOR_COUNT }, (_, index) => {
    if (index === FOUNDER_INDEX) return { x: 0, y: 0.44, z: 0.38, radius: 0.074 };
    const ring = Math.floor(index / CONTRIBUTORS_PER_RING);
    const slot = index % CONTRIBUTORS_PER_RING;
    const angle = (slot / CONTRIBUTORS_PER_RING) * Math.PI * 2 + (ring * Math.PI) / 20;
    const radiusX = 0.7 + ring * 0.065;
    const radiusY = 0.46 + ring * 0.0275;
    const radius = 0.022 - ring * 0.0004;
    const depthStep = ((slot + ring * 7) % 3) - 1;
    return {
      x: Math.cos(angle) * radiusX,
      y: Math.sin(angle) * radiusY + 0.02,
      z: 0.28 - ring * 0.045 + depthStep * 0.008,
      radius,
    };
  });

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

function normalize(x: number, y: number, z: number): readonly [number, number, number] {
  const length = Math.hypot(x, y, z);
  return length > 0 ? [x / length, y / length, z / length] : [0, 0, -1];
}

function sphereScale(index: number, motion: T3DViewportMotion): number {
  const radiusScale = terminalBadgeContributorRadiusScales[index] ?? 1;
  if (motion.selectedObjectId === index) {
    return radiusScale * (index === FOUNDER_INDEX ? FOUNDER_SELECTED_SCALE : SELECTED_SCALE);
  }
  if (motion.hoveredObjectId === index) {
    return radiusScale * (index === FOUNDER_INDEX ? FOUNDER_HOVER_SCALE : HOVER_SCALE);
  }
  return radiusScale;
}

function raySphere(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  sphere: TerminalBadgeContributorSphere,
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

export function pickTerminalBadgeContributor(context: T3DHitTestContext): T3DHitResult | null {
  const pixelWidth = Math.max(1, Math.floor(finite(context.pixelWidth, 1)));
  const pixelHeight = Math.max(1, Math.floor(finite(context.pixelHeight, 1)));
  const cellHeight = Math.max(1, Math.floor(finite(context.cellHeight, 1)));
  const zoom = Math.max(0.01, finite(context.motion.zoom, 1));
  const cameraDistance = 2.45 / zoom;
  const uvX = finite(context.pointerX, 0) * 0.5 * (pixelWidth / pixelHeight);
  const uvY = -finite(context.pointerY, 0) * 0.5;
  const worldDirection = normalize(uvX, uvY, -1.9);
  const rayOrigin = sceneLocal([0, 0.02, cameraDistance], context.motion);
  const rayDirection = sceneLocal(worldDirection, context.motion);

  let closestDistance = Number.POSITIVE_INFINITY;
  let closestIndex = -1;
  for (let index = 0; index < terminalBadgeContributorSpheres.length; index++) {
    const sphere = terminalBadgeContributorSpheres[index]!;
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
  const login = contributorAvatarLogins[closestIndex];
  if (!login) return null;
  return {
    objectId: closestIndex,
    label: login,
    href: `https://github.com/${login}`,
  };
}
