/**
 * GitHub data-fetching layer for @simon_he/repo-3d-badge.
 *
 * Turns a GitHub repo URL into the structured {@link Repo3DData} needed to
 * render a 3D terminal badge: repo metadata, contributor list, and a decoded
 * logo bitmap (with provenance).
 *
 * Runtime: Bun (or any ESM runtime with a global `fetch`). Image decoding is
 * best-effort via `sharp`; every failure falls through to a `generated`
 * logo so callers always get a usable {@link Repo3DData}.
 */

import type {
  FetchOptions,
  Repo3DData,
  RepoContributor,
  RepoLogo,
  RepoMeta,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_CONTRIBUTORS = 100;

const GITHUB_API = "https://api.github.com";

/** Read a GitHub token from the common env vars, if present. */
export function readTokenFromEnv(): string | undefined {
  return process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? undefined;
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

/**
 * Parse a GitHub repo reference in any common form and return the owner/repo.
 *
 * Accepts `owner/repo`, `https://github.com/owner/repo[.git]`,
 * `git@github.com:owner/repo.git`, `/tree/<branch>` and `/blob/...` paths, and
 * URLs carrying a query string or hash. Case is preserved.
 *
 * @throws {Error} if no `owner/repo` can be extracted.
 */
export function parseRepoInput(input: string): { owner: string; repo: string } {
  const raw = input.trim();
  if (!raw) throw new Error(`Could not parse GitHub repo from: ${input}`);

  // Drop query string and hash first — they never carry owner/repo.
  let s = raw.split("#")[0]!.split("?")[0]!;

  // git@github.com:owner/repo(.git)
  const ssh = s.match(/^git@github\.com:(.*)$/i);
  if (ssh) {
    s = ssh[1] ?? "";
  } else {
    // https?://(www.)github.com/owner/repo...
    s = s.replace(/^https?:\/\/(?:www\.)?github\.com\//i, "");
  }

  // First two non-empty path segments are owner/repo. Trailing /tree/<branch>
  // and /blob/... are simply ignored because we only keep the first two.
  const parts = s.split("/").filter((p) => p.length > 0);
  if (parts.length < 2) {
    throw new Error(`Could not parse GitHub repo from: ${input}`);
  }

  const owner = parts[0]!;
  let repo = parts[1]!.replace(/\.git$/i, "");
  if (!owner || !repo) {
    throw new Error(`Could not parse GitHub repo from: ${input}`);
  }
  return { owner, repo };
}

// ---------------------------------------------------------------------------
// Low-level fetch helpers
// ---------------------------------------------------------------------------

function timeoutSignal(opts: FetchOptions): AbortSignal {
  return AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

/** Headers for GitHub REST API calls (JSON). */
function apiHeaders(opts: FetchOptions, accept = "application/vnd.github+json"): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    "User-Agent": "repo-3d-badge",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  return headers;
}

/**
 * Headers for binary image downloads. The UA is always sent; the bearer token
 * is attached ONLY to GitHub-owned hosts so a user's token is never forwarded
 * to arbitrary third-party image CDNs or OpenGraph mirrors.
 */
function imageHeaders(url: string, opts: FetchOptions): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": "repo-3d-badge" };
  if (opts.token && isGithubHost(url)) headers.Authorization = `Bearer ${opts.token}`;
  return headers;
}

function isGithubHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "api.github.com" ||
      host === "github.com" ||
      host.endsWith(".githubusercontent.com")
    );
  } catch {
    return false;
  }
}

/** Throw a clear Error including status + GitHub message body on non-2xx. */
async function ensureOk(res: Response, url: string): Promise<void> {
  if (res.ok) return;
  let body = "";
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }
  throw new Error(
    `GitHub request to ${url} failed: ${res.status} ${res.statusText}${
      body ? ` - ${body}` : ""
    }`,
  );
}

/** Fetch raw bytes for a URL with the shared timeout + (GitHub-only) auth. */
async function fetchBytes(url: string, opts: FetchOptions = {}): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: imageHeaders(url, opts),
    signal: timeoutSignal(opts),
    redirect: "follow",
  });
  await ensureOk(res, url);
  return new Uint8Array(await res.arrayBuffer());
}

/** Decode an image buffer to raw RGBA via sharp; null on any failure / too small. */
async function decodeImageSafe(
  bytes: Uint8Array,
): Promise<{ rgba: Uint8Array; width: number; height: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const img = sharp(bytes);
    const meta = await img.metadata();
    if (!meta.width || meta.width < 32) return null;
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { rgba: new Uint8Array(data), width: info.width, height: info.height };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Minimal GitHub API response shapes (only what we read)
// ---------------------------------------------------------------------------

interface GhRepoOwner {
  login: string;
  avatar_url: string;
  type: string;
}

interface GhRepo {
  full_name?: string;
  description?: string | null;
  stargazers_count?: number;
  default_branch?: string;
  homepage?: string | null;
  language?: string | null;
  owner?: GhRepoOwner;
}

interface GhContributor {
  login?: string | null;
  type?: string;
  contributions?: number;
  html_url?: string;
  avatar_url?: string;
}

// ---------------------------------------------------------------------------
// Public fetch stages
// ---------------------------------------------------------------------------

/** Fetch and map repository metadata from the GitHub REST API. */
export async function fetchRepoMeta(
  owner: string,
  repo: string,
  opts: FetchOptions = {},
): Promise<RepoMeta> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}`;
  const res = await fetch(url, {
    headers: apiHeaders(opts),
    signal: timeoutSignal(opts),
    redirect: "follow",
  });
  await ensureOk(res, url);
  const data = (await res.json()) as GhRepo;

  return {
    owner,
    repo,
    fullName: data.full_name ?? `${owner}/${repo}`,
    description: data.description ?? null,
    stargazersCount: data.stargazers_count ?? 0,
    ownerLogin: data.owner?.login ?? owner,
    ownerAvatarUrl: data.owner?.avatar_url ?? "",
    ownerType: data.owner?.type === "Organization" ? "Organization" : "User",
    defaultBranch: data.default_branch ?? "main",
    homepage: data.homepage ?? null,
    primaryLanguage: typeof data.language === "string" ? data.language : null,
  };
}

// Login patterns that look like bots / automation accounts.
const BOT_LOGIN_RE = /\[(bot|renovate|dependabot)\]|-bot$|bot$/i;

function isBotContributor(c: GhContributor): boolean {
  if (c.type === "Anonymous") return true;
  const login = c.login ?? "";
  return BOT_LOGIN_RE.test(login);
}

/** Fetch contributors, filtering out bot/anonymous accounts. Never throws on empty. */
export async function fetchRepoContributors(
  owner: string,
  repo: string,
  opts: FetchOptions = {},
): Promise<RepoContributor[]> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contributors?per_page=100&anon=1`;
  const res = await fetch(url, {
    headers: apiHeaders(opts),
    signal: timeoutSignal(opts),
    redirect: "follow",
  });
  await ensureOk(res, url);
  const data = (await res.json()) as GhContributor[];
  const list = Array.isArray(data) ? data : [];
  const max = opts.maxContributors ?? DEFAULT_MAX_CONTRIBUTORS;

  const out: RepoContributor[] = [];
  for (const c of list) {
    if (isBotContributor(c)) continue;
    const login = c.login;
    if (!login) continue;
    out.push({
      login,
      avatarUrl: `https://avatars.githubusercontent.com/${login}?s=64`,
      contributions: c.contributions ?? 0,
      htmlUrl: c.html_url ?? `https://github.com/${login}`,
    });
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Logo resolution
// ---------------------------------------------------------------------------

const BADGE_URL_RE =
  /img\.shields\.io|img\.shields|badge|codecov|travis-ci|coveralls|opencollective|circleci|deepscan|gitter|wakatime|github\.com\/.*\/(?:actions|workflows)/i;
const BADGE_ALT_RE = /badge|build|coverage|status/i;

function isBadgeCandidate(url: string, alt: string): boolean {
  return BADGE_URL_RE.test(url) || BADGE_ALT_RE.test(alt);
}

interface ImageCandidate {
  url: string;
  alt: string;
  index: number;
}

/** Extract markdown `![]()` and HTML `<img src="">` image candidates in document order. */
function extractImageCandidates(markdown: string): ImageCandidate[] {
  const out: ImageCandidate[] = [];

  const mdRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(markdown)) !== null) {
    out.push({ alt: m[1] ?? "", url: m[2] ?? "", index: m.index });
  }

  const imgRe = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
  while ((m = imgRe.exec(markdown)) !== null) {
    const tag = m[0] ?? "";
    const url = m[1] ?? m[2] ?? "";
    const altMatch = /<img\b[^>]*\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const alt = altMatch ? (altMatch[1] ?? altMatch[2] ?? "") : "";
    out.push({ url, alt, index: m.index });
  }

  out.sort((a, b) => a.index - b.index);
  return out;
}

/** Build candidate absolute URLs for a (possibly relative) README image URL. */
function resolveImageUrl(rawUrl: string, meta: RepoMeta): string[] {
  const trimmed = rawUrl.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("data:")) return [];

  // Absolute URL (incl. protocol-relative).
  if (/^https?:\/\//i.test(trimmed)) return [trimmed];
  if (trimmed.startsWith("//")) return [`https:${trimmed}`];

  // Relative: prefer raw file host, fall back to the repo UI URL.
  const rawBase = `https://raw.githubusercontent.com/${meta.fullName}/${meta.defaultBranch}/`;
  const repoBase = `https://github.com/${meta.fullName}`;
  const candidates: string[] = [];
  try {
    candidates.push(new URL(trimmed, rawBase).href);
  } catch {
    /* malformed */
  }
  try {
    candidates.push(new URL(trimmed, repoBase).href);
  } catch {
    /* malformed */
  }
  return candidates;
}

type DecodedImage = { rgba: Uint8Array; width: number; height: number };

/** a) Find the first non-badge image in the README that decodes to a real bitmap. */
async function tryReadmeLogo(meta: RepoMeta, opts: FetchOptions): Promise<DecodedImage | null> {
  const readmeUrl = `${GITHUB_API}/repos/${meta.owner}/${meta.repo}/readme`;
  let markdown = "";
  try {
    const res = await fetch(readmeUrl, {
      headers: apiHeaders(opts, "application/vnd.github.raw+json"),
      signal: timeoutSignal(opts),
      redirect: "follow",
    });
    if (!res.ok) return null;
    markdown = await res.text();
  } catch {
    return null;
  }
  if (!markdown) return null;

  for (const c of extractImageCandidates(markdown)) {
    if (!c.url || isBadgeCandidate(c.url, c.alt)) continue;
    for (const url of resolveImageUrl(c.url, meta)) {
      const bytes = await fetchBytes(url, opts).catch(() => null);
      if (!bytes || bytes.length === 0) continue;
      const decoded = await decodeImageSafe(bytes);
      if (decoded && decoded.width >= 32) return decoded;
    }
  }
  return null;
}

/** b) OpenGraph card image from the githubassets mirror (PNG, >=64px). */
async function tryOpenGraph(meta: RepoMeta, opts: FetchOptions): Promise<DecodedImage | null> {
  const url = `https://opengraph.githubassets.com/1/${meta.owner}/${meta.repo}`;
  const bytes = await fetchBytes(url, opts).catch(() => null);
  if (!bytes || bytes.length === 0) return null;
  const decoded = await decodeImageSafe(bytes);
  if (decoded && decoded.width >= 64) return decoded;
  return null;
}

/** c) Owner avatar (sized to 128px when the URL has no query already). */
async function tryOwnerAvatar(meta: RepoMeta, opts: FetchOptions): Promise<DecodedImage | null> {
  if (!meta.ownerAvatarUrl) return null;
  const url = meta.ownerAvatarUrl.includes("?")
    ? meta.ownerAvatarUrl
    : `${meta.ownerAvatarUrl}?s=128`;
  const bytes = await fetchBytes(url, opts).catch(() => null);
  if (!bytes || bytes.length === 0) return null;
  const decoded = await decodeImageSafe(bytes);
  if (decoded && decoded.width >= 32) return decoded;
  return null;
}

/**
 * Resolve a repo logo in priority order: README -> OpenGraph -> owner avatar.
 * Falls back to an empty `generated` logo if nothing decodes.
 */
export async function resolveRepoLogo(
  meta: RepoMeta,
  contributors: RepoContributor[],
  opts: FetchOptions = {},
): Promise<RepoLogo> {
  const readme = await tryReadmeLogo(meta, opts);
  if (readme) return { ...readme, source: "readme" };

  const og = await tryOpenGraph(meta, opts);
  if (og) return { ...og, source: "opengraph" };

  const owner = await tryOwnerAvatar(meta, opts);
  if (owner) return { ...owner, source: "owner" };

  return { rgba: new Uint8Array(0), width: 0, height: 0, source: "generated" };
}

// ---------------------------------------------------------------------------
// Top-level orchestration
// ---------------------------------------------------------------------------

/** Fetch everything needed to render a 3D badge for one repository. */
export async function fetchRepo3DData(
  input: string,
  opts: FetchOptions = {},
): Promise<Repo3DData> {
  const { owner, repo } = parseRepoInput(input);
  const [meta, contributors] = await Promise.all([
    fetchRepoMeta(owner, repo, opts),
    fetchRepoContributors(owner, repo, opts),
  ]);
  const logo = await resolveRepoLogo(meta, contributors, opts);
  return { meta, contributors, logo };
}
