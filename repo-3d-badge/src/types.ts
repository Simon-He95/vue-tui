/**
 * Shared data types for @simon_he/repo-3d-badge.
 *
 * Data flows: repo URL -> GitHub fetch ({@link Repo3DData}) ->
 * image/SDF processing -> WebGPU textures -> 3D terminal badge.
 */

/** A single GitHub contributor. */
export interface RepoContributor {
  /** GitHub login, e.g. "yyx990803". */
  login: string;
  /** Square avatar URL (already sized, e.g. 64px). */
  avatarUrl: string;
  /** Commit contribution count. */
  contributions: number;
  /** Profile URL, e.g. https://github.com/yyx990803. */
  htmlUrl: string;
}

/** Where the logo bitmap came from. */
export type RepoLogoSource = "readme" | "opengraph" | "owner" | "generated";

/** A decoded repo logo bitmap with provenance. */
export interface RepoLogo {
  /** Tightly packed RGBA8 pixels, top-left origin, row-major. */
  rgba: Uint8Array;
  width: number;
  height: number;
  source: RepoLogoSource;
}

/** Repository metadata from the GitHub REST API. */
export interface RepoMeta {
  owner: string;
  repo: string;
  /** "owner/repo". */
  fullName: string;
  description: string | null;
  stargazersCount: number;
  ownerLogin: string;
  ownerAvatarUrl: string;
  ownerType: "User" | "Organization";
  defaultBranch: string;
  homepage: string | null;
  primaryLanguage: string | null;
}

/** Everything needed to render a 3D badge for one repository. */
export interface Repo3DData {
  meta: RepoMeta;
  contributors: RepoContributor[];
  logo: RepoLogo;
}

/** Options shared across fetch stages. */
export interface FetchOptions {
  /** Optional GitHub token to raise rate limits (60 -> 5000/hour). */
  token?: string;
  /** Max contributors to keep (default 100). */
  maxContributors?: number;
  /** Fetch timeout in ms (default 15000). */
  timeoutMs?: number;
}

/**
 * A packed texture for the logo: RGB carries the logo color, the A channel
 * carries a normalized signed distance field of the logo alpha mask.
 * This lets the shader raymarch an extrusion of the logo shape and shade it
 * with the logo's own colors, reusing the vue-tui badge material framework.
 */
export interface LogoSdfTexture {
  rgba: Uint8Array;
  width: number;
  height: number;
}

/** A packed avatar atlas texture (square tiles, row-major). */
export interface AvatarAtlasTexture {
  rgba: Uint8Array;
  width: number;
  height: number;
  /** Per-tile pixel size. */
  tileSize: number;
  /** Tiles per row. */
  columns: number;
}

/** A contributor sphere in the 3D scene. */
export interface ContributorSphere {
  x: number;
  y: number;
  z: number;
  radius: number;
  /** Index into the contributor array (and atlas). */
  index: number;
}
