import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAvatar, fallbackAvatar } from "./avatar.js";
import { defaultUser, fallbackSnapshotUrl } from "./constants.js";
import cachedSnapshotJson from "./data/simon-he95.snapshot.json";
import { fetchJson, fetchText } from "./network.js";
import type {
  CardSnapshot,
  ContributionData,
  ContributionDay,
  GitHubProfile,
  LoadingStatus,
} from "./types.js";

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function decodeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
  };
  return value.replace(/&(amp|lt|gt|quot|#39);/gu, (entity) => entities[entity] ?? entity);
}

function parseContributionCount(text: string): number {
  if (/No contributions/u.test(text)) return 0;
  const match = text.match(/([\d,]+)\s+contribution/u);
  return match ? Number(match[1]!.replace(/,/gu, "")) : 0;
}

function parseContributions(html: string): ContributionData {
  const totalMatch = html.match(
    /<h2[^>]*id="js-contribution-activity-description"[^>]*>([\s\S]*?)<\/h2>/u,
  );
  const totalText = totalMatch ? stripHtml(decodeHtml(totalMatch[1]!)) : "Contributions";
  const days: ContributionDay[] = [];
  const dayRe =
    /<td\b[^>]*data-date="([^"]+)"[^>]*data-level="([^"]+)"[^>]*><\/td>\s*<tool-tip\b[^>]*>([\s\S]*?)<\/tool-tip>/gu;
  for (const match of html.matchAll(dayRe)) {
    days.push({
      date: match[1]!,
      level: Math.max(0, Math.min(4, Number(match[2]) || 0)),
      count: parseContributionCount(decodeHtml(stripHtml(match[3]!))),
    });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) throw new Error("No contribution days found in GitHub response");
  return { days, totalText };
}

function normalizeProfile(profile: GitHubProfile): GitHubProfile {
  return {
    login: profile.login,
    avatar_url: profile.avatar_url,
    html_url: profile.html_url,
    name: profile.name,
    company: profile.company,
    blog: profile.blog,
    location: profile.location,
    bio: profile.bio,
    public_repos: profile.public_repos,
    followers: profile.followers,
    following: profile.following,
    created_at: profile.created_at,
  };
}

export function readCachedSnapshot(username: string = defaultUser): CardSnapshot | null {
  if (username.toLowerCase() !== defaultUser.toLowerCase()) return null;
  const snapshot = cachedSnapshotJson as CardSnapshot;
  return { ...snapshot, avatar: fallbackAvatar(snapshot.profile.login, 14, 7) };
}

export function writeCachedSnapshot(snapshot: CardSnapshot): void {
  const path = fileURLToPath(fallbackSnapshotUrl);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
}

export async function fetchLiveSnapshot(
  username: string,
  cached: CardSnapshot | null,
  loading: LoadingStatus,
): Promise<CardSnapshot> {
  loading.set("Fetching GitHub profile and contribution calendar...");
  const [rawProfile, contributionHtml] = await Promise.all([
    fetchJson<GitHubProfile>(`https://api.github.com/users/${encodeURIComponent(username)}`),
    fetchText(`https://github.com/users/${encodeURIComponent(username)}/contributions`),
  ]);
  const profile = normalizeProfile(rawProfile);
  const contributions = parseContributions(contributionHtml);
  loading.set("Rendering terminal avatar...");
  const avatar = await buildAvatar(profile, 14, 7, cached ?? undefined);
  return {
    capturedAt: new Date().toISOString(),
    profile,
    contributions,
    avatar: avatar.cells,
    avatarPngBase64: avatar.pngBase64,
  };
}
