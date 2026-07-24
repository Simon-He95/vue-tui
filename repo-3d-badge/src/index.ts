/**
 * Public API for @simon_he/repo-3d-badge.
 *
 * Turn any GitHub repository into a textured 3D terminal badge:
 * contributors orbit a 3D extrusion of the repo logo, rendered with WebGPU.
 */

// Data layer — fetch repo metadata, contributors, and logo from GitHub.
export {
  parseRepoInput,
  fetchRepoMeta,
  fetchRepoContributors,
  resolveRepoLogo,
  fetchRepo3DData,
  readTokenFromEnv,
} from "./github.js";

// Image / SDF layer — logo fallback, avatar atlas, signed distance field.
export {
  decodeImage,
  decodeResizeSquare,
  buildAvatarAtlas,
  generateLogoFallback,
} from "./image.js";
export { buildLogoSdfTexture, euclideanDistanceTransform } from "./sdf.js";

// Scene + renderer — 3D layout, object picking, and the WebGPU renderer.
export { buildContributorScene, createBadgeHitTest } from "./scene.js";
export type { SceneLayout } from "./scene.js";
export { createRepoBadgeRenderer } from "./renderer.js";
export type { RepoBadgeRendererOptions, RepoBadgeBuildResult } from "./renderer.js";
export { buildBadgeSceneWgsl } from "./badge.wgsl.js";
export type { BadgeSceneWgslInput } from "./badge.wgsl.js";

// Shared types.
export type {
  RepoContributor,
  RepoLogo,
  RepoLogoSource,
  RepoMeta,
  Repo3DData,
  FetchOptions,
  LogoSdfTexture,
  AvatarAtlasTexture,
  ContributorSphere,
} from "./types.js";
