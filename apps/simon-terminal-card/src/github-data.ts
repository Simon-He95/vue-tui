import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAvatar, fallbackAvatar } from "./avatar.js";
import { defaultUser, fallbackSnapshotUrl } from "./constants.js";
import cachedSnapshotJson from "./data/simon-he95.snapshot.json";
import { fetchText } from "./network.js";
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
    "&apos;": "'",
    "&nbsp;": " ",
    "&middot;": "·",
  };
  return value
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp|middot|#39);/gu, (entity) => entities[entity] ?? entity);
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

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "u"));
  return match ? decodeHtml(match[1]!) : null;
}

function cleanHtmlText(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = stripHtml(decodeHtml(value));
  return text || null;
}

function readMetaContent(html: string, key: string): string | null {
  for (const match of html.matchAll(/<meta\b([^>]*)>/gu)) {
    const attrs = match[1]!;
    if (readAttribute(attrs, "property") !== key && readAttribute(attrs, "name") !== key) continue;
    return readAttribute(attrs, "content");
  }
  return null;
}

function readClassText(html: string, className: string): string | null {
  const match = html.match(
    new RegExp(`<[^>]+class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, "u"),
  );
  return cleanHtmlText(match?.[1]);
}

function readItemPropBlock(html: string, itemProp: string): { tag: string; body: string } | null {
  const match = html.match(
    new RegExp(`<li\\b([^>]*\\bitemprop="${itemProp}"[^>]*)>([\\s\\S]*?)<\\/li>`, "u"),
  );
  return match ? { tag: match[1]!, body: match[2]! } : null;
}

function parseCounterText(value: string | null | undefined): number {
  const text = stripHtml(decodeHtml(value ?? ""))
    .trim()
    .toLowerCase();
  const match = text.match(/([\d,.]+)\s*([kmb])?/u);
  if (!match) return 0;
  const number = Number(match[1]!.replace(/,/gu, ""));
  if (!Number.isFinite(number)) return 0;
  const scale =
    match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : match[2] === "b" ? 1_000_000_000 : 1;
  return Math.round(number * scale);
}

function readNavCounter(html: string, tab: string): number {
  const anchor = html.match(
    new RegExp(`<a\\b[^>]*\\bdata-tab-item="${tab}"[^>]*>[\\s\\S]*?<\\/a>`, "u"),
  )?.[0];
  if (!anchor) return 0;
  const counter = anchor.match(/<span\b([^>]*\bCounter\b[^>]*)>([\s\S]*?)<\/span>/u);
  return parseCounterText(readAttribute(counter?.[1] ?? "", "title") ?? counter?.[2]);
}

function readFollowerCount(html: string, tab: "followers" | "following"): number {
  const link = html.match(new RegExp(`href="[^"]*\\?tab=${tab}"[^>]*>[\\s\\S]*?<\\/a>`, "u"))?.[0];
  const count = link?.match(/<span\b[^>]*\btext-bold\b[^>]*>([\s\S]*?)<\/span>/u);
  return parseCounterText(count?.[1]);
}

function readProfileAvatarUrl(html: string): string | null {
  const imageLink = html.match(/<a\b[^>]*\bitemprop="image"[^>]*>[\s\S]*?<img\b([^>]*)>/u);
  const imageSrc = readAttribute(imageLink?.[1] ?? "", "src");
  return imageSrc ?? readMetaContent(html, "og:image");
}

function readProfileBlog(html: string): string | null {
  const block = readItemPropBlock(html, "url")?.body;
  if (!block) return null;
  const link = block.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/u);
  return cleanHtmlText(link?.[2]) ?? readAttribute(link?.[1] ?? "", "href");
}

function readProfileField(
  html: string,
  itemProp: string,
  ariaPrefix: string,
  className: string,
): string | null {
  const block = readItemPropBlock(html, itemProp);
  if (!block) return null;
  const label = readAttribute(block.tag, "aria-label");
  if (label?.startsWith(ariaPrefix)) return label.slice(ariaPrefix.length).trim();
  return readClassText(block.body, className) ?? cleanHtmlText(block.body);
}

export function parseProfile(html: string, username: string): GitHubProfile {
  const login =
    readClassText(html, "p-nickname") ?? readMetaContent(html, "profile:username") ?? username;
  const htmlUrl =
    readMetaContent(html, "og:url") ?? `https://github.com/${encodeURIComponent(login)}`;
  return {
    login,
    avatar_url: readProfileAvatarUrl(html) ?? `https://github.com/${encodeURIComponent(login)}.png`,
    html_url: htmlUrl,
    name: readClassText(html, "p-name"),
    company: readProfileField(html, "worksFor", "Organization:", "p-org"),
    blog: readProfileBlog(html),
    location: readProfileField(html, "homeLocation", "Home location:", "p-label"),
    bio:
      readAttribute(
        html.match(/<div\b[^>]*\bdata-bio-text="[^"]*"[^>]*>/u)?.[0] ?? "",
        "data-bio-text",
      ) ?? readClassText(html, "p-note"),
    public_repos: readNavCounter(html, "repositories"),
    followers: readFollowerCount(html, "followers"),
    following: readFollowerCount(html, "following"),
    created_at: "",
  };
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

function userCacheRoot(): string {
  return process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
}

function userSnapshotPath(username: string): string {
  const name = username.toLowerCase().replace(/[^a-z0-9-]/gu, "_");
  return join(userCacheRoot(), "simon-terminal-card", `${name}.snapshot.json`);
}

function normalizeSnapshot(snapshot: CardSnapshot): CardSnapshot {
  return {
    ...snapshot,
    avatar: snapshot.avatar?.length
      ? snapshot.avatar
      : fallbackAvatar(snapshot.profile.login, 14, 7),
  };
}

function readUserCachedSnapshot(username: string): CardSnapshot | null {
  const path = userSnapshotPath(username);
  if (!existsSync(path)) return null;
  try {
    return normalizeSnapshot(JSON.parse(readFileSync(path, "utf8")) as CardSnapshot);
  } catch {
    return null;
  }
}

export function readCachedSnapshot(username: string = defaultUser): CardSnapshot | null {
  const userSnapshot = readUserCachedSnapshot(username);
  if (userSnapshot) return userSnapshot;
  if (username.toLowerCase() !== defaultUser.toLowerCase()) return null;
  const snapshot = cachedSnapshotJson as CardSnapshot;
  return { ...snapshot, avatar: fallbackAvatar(snapshot.profile.login, 14, 7) };
}

export function writeUserCachedSnapshot(snapshot: CardSnapshot): void {
  const path = userSnapshotPath(snapshot.profile.login);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
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
  loading.set("Fetching GitHub profile page and contribution calendar...");
  const [profileHtml, contributionHtml] = await Promise.all([
    fetchText(`https://github.com/${encodeURIComponent(username)}`),
    fetchText(`https://github.com/users/${encodeURIComponent(username)}/contributions`),
  ]);
  loading.set("Parsing GitHub profile and contribution data...");
  const profile = normalizeProfile(parseProfile(profileHtml, username));
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
