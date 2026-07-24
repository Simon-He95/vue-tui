import {
  TERMINAL_BADGE_CONTRIBUTOR_COUNT,
  terminalBadgeContributorRadiusScales,
  terminalBadgeContributorSpheres,
} from "./terminal-badge-scene.js";

const contributorCentersWgsl = terminalBadgeContributorSpheres
  .map(
    ({ x, y, z, radius }) =>
      `  vec4f(${x.toFixed(6)}, ${y.toFixed(6)}, ${z.toFixed(6)}, ${radius.toFixed(6)})`,
  )
  .join(",\n");
const contributorRadiiWgsl = terminalBadgeContributorRadiusScales
  .map((scale) => `  ${scale.toFixed(1)}`)
  .join(",\n");

export const terminalBadge3DWgsl = /* wgsl */ `
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
@group(0) @binding(2) var contributorAvatarAtlas: texture_2d<f32>;

const PI: f32 = 3.14159265;
const CONTRIBUTOR_COUNT: u32 = ${TERMINAL_BADGE_CONTRIBUTOR_COUNT}u;
const CONTRIBUTOR_AVATAR_SIZE: i32 = 32;
const CONTRIBUTOR_ATLAS_COLUMNS: i32 = 16;
const CONTRIBUTOR_CENTERS = array<vec4f, ${TERMINAL_BADGE_CONTRIBUTOR_COUNT}>(
${contributorCentersWgsl}
);
const CONTRIBUTOR_RADII = array<f32, ${TERMINAL_BADGE_CONTRIBUTOR_COUNT}>(
${contributorRadiiWgsl}
);
const VUE_MIDDLE_SCALE: f32 = 0.6;
const VUE_CUTOUT_SCALE: f32 = 0.23094;
const LOGO_WIDTH: f32 = 1.18;
const LOGO_HEIGHT: f32 = LOGO_WIDTH * (170.02 / 196.32);

fn rotate2(point: vec2f, angle: f32) -> vec2f {
  let c = cos(angle);
  let s = sin(angle);
  return vec2f(c * point.x - s * point.y, s * point.x + c * point.y);
}

fn boxDistance(point: vec3f, halfSize: vec3f) -> f32 {
  let q = abs(point) - halfSize;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn segmentDistance(point: vec2f, a: vec2f, b: vec2f) -> f32 {
  let edge = b - a;
  let projection = clamp(dot(point - a, edge) / dot(edge, edge), 0.0, 1.0);
  return length(point - (a + edge * projection));
}

fn triangleDistance(point: vec2f, a: vec2f, b: vec2f, c: vec2f) -> f32 {
  let distance = min(
    segmentDistance(point, a, b),
    min(segmentDistance(point, b, c), segmentDistance(point, c, a)),
  );
  let edge0 = b - a;
  let edge1 = c - b;
  let edge2 = a - c;
  let side0 = edge0.x * (point.y - a.y) - edge0.y * (point.x - a.x);
  let side1 = edge1.x * (point.y - b.y) - edge1.y * (point.x - b.x);
  let side2 = edge2.x * (point.y - c.y) - edge2.y * (point.x - c.x);
  let inside = (side0 >= 0.0 && side1 >= 0.0 && side2 >= 0.0) ||
    (side0 <= 0.0 && side1 <= 0.0 && side2 <= 0.0);
  return select(distance, -distance, inside);
}

fn vueTriangleDistance(point: vec2f, scale: f32) -> f32 {
  let scaledHeight = LOGO_HEIGHT * scale;
  let center = vec2f(0.0, (LOGO_HEIGHT - scaledHeight) * 0.5);
  let local = point - center;
  let topLeft = vec2f(-LOGO_WIDTH * scale * 0.5, scaledHeight * 0.5);
  let topRight = vec2f(LOGO_WIDTH * scale * 0.5, scaledHeight * 0.5);
  let bottom = vec2f(0.0, -scaledHeight * 0.5);
  return triangleDistance(local, topLeft, topRight, bottom);
}

fn vueLayerDistance(point: vec2f, scale: f32) -> f32 {
  let outer = vueTriangleDistance(point, scale);
  let cutout = vueTriangleDistance(point, VUE_CUTOUT_SCALE);
  return max(outer, -cutout);
}

fn vueExtrudedDistance(point: vec3f) -> f32 {
  let face = vueLayerDistance(point.xy, 1.0);
  let side = abs(point.z) - 0.07;
  let bevel = 0.01;
  return max(max(face, side), (face + side + bevel) * 0.70710678);
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
  let base = CONTRIBUTOR_CENTERS[index].w * CONTRIBUTOR_RADII[index];
  if (index == uniforms.selectedObjectId) {
    return base * select(2.3, 1.8, index == 0u);
  }
  if (index == uniforms.hoveredObjectId) {
    return base * select(1.8, 1.3, index == 0u);
  }
  return base;
}

fn baseScene(point: vec3f) -> vec2f {
  let logo = vueExtrudedDistance(logoLocal(point));
  // The backing surface is intentionally unbounded so camera zoom cannot reveal its edges.
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

fn logoMaterial(point: vec3f, normal: vec3f, rayDirection: vec3f) -> vec3f {
  let local = logoLocal(point);
  let localNormal = logoLocalDirection(normal);
  let vueGreen = vec3f(0.2588, 0.7216, 0.5137);
  let vueSlate = vec3f(0.2078, 0.2863, 0.3686);
  let isSlate = vueLayerDistance(local.xy, VUE_MIDDLE_SCALE) < 0.0;
  var base = select(vueGreen, vueSlate, isSlate);

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
  return base + vec3f(0.62, 0.92, 0.82) * gloss * (0.34 + speedGlow) +
    vec3f(0.12, 0.48, 0.34) * edge * (0.14 + speedGlow);
}

fn sampleContributorAvatar(index: u32, uv: vec2f) -> vec3f {
  let tile = vec2i(i32(index) % CONTRIBUTOR_ATLAS_COLUMNS, i32(index) / CONTRIBUTOR_ATLAS_COLUMNS);
  let tileOrigin = tile * CONTRIBUTOR_AVATAR_SIZE;
  let texel = clamp(uv, vec2f(0.0), vec2f(1.0)) * f32(CONTRIBUTOR_AVATAR_SIZE - 1);
  if (index != 0u) {
    return textureLoad(contributorAvatarAtlas, tileOrigin + vec2i(round(texel)), 0).rgb;
  }

  let first = vec2i(floor(texel));
  let second = min(first + vec2i(1), vec2i(CONTRIBUTOR_AVATAR_SIZE - 1));
  let weight = fract(texel);
  let top = mix(
    textureLoad(contributorAvatarAtlas, tileOrigin + vec2i(first.x, first.y), 0).rgb,
    textureLoad(contributorAvatarAtlas, tileOrigin + vec2i(second.x, first.y), 0).rgb,
    weight.x,
  );
  let bottom = mix(
    textureLoad(contributorAvatarAtlas, tileOrigin + vec2i(first.x, second.y), 0).rgb,
    textureLoad(contributorAvatarAtlas, tileOrigin + second, 0).rgb,
    weight.x,
  );
  return mix(top, bottom, weight.y);
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
