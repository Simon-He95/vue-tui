import { isAbsolutePath, normalizePath, resolvePath } from "../../../utils/path.js";
import { hasEncodedControl } from "../../../utils/url-safety.js";

export type ResolveTInputPathInfo = Readonly<{
  workspace: string;
  input: string;
  preserveBackslash?: boolean;
  homeDir?: string;
}>;

export type TInputHostAdapter = Readonly<{
  isTerminalLike?: boolean;
  resolvePath?: (info: ResolveTInputPathInfo) => string;
  pathToHref?: (pathLike: string) => string | undefined;
  readClipboardText?: () => Promise<string>;
  writeClipboardText?: (text: string) => Promise<boolean>;
  showToast?: (message: string) => void;
}>;

function isAbsoluteRawPath(path: string): boolean {
  const value = String(path ?? "").trim();
  if (!value) return false;
  if (value.startsWith("/") || value.startsWith("\\\\")) return true;
  return /^[A-Z]:[\\/]/i.test(value);
}

function joinPreservingBackslashes(base: string, next: string): string {
  const left = String(base ?? "");
  const right = String(next ?? "");
  if (!left) return right;
  if (!right) return left;
  if (isAbsoluteRawPath(right)) return right;
  if (left.endsWith("/") || left.endsWith("\\")) return `${left}${right}`;
  return `${left}/${right}`;
}

export function resolveDefaultTInputPath(info: ResolveTInputPathInfo): string {
  const workspaceAbs = normalizePath(String(info.workspace ?? ""));
  const raw = String(info.input ?? "")
    .replace(/\r/g, "")
    .trim();
  if (!raw) return resolvePath(workspaceAbs, ".");

  const homeMatch = raw.match(/^~(?:[\\/](.*))?$/);
  if (homeMatch && info.homeDir) {
    const rest = homeMatch[1] ?? "";
    if (info.preserveBackslash) return joinPreservingBackslashes(info.homeDir, rest);
    return resolvePath(normalizePath(info.homeDir), rest);
  }

  if (info.preserveBackslash) {
    if (isAbsoluteRawPath(raw)) return raw;
    return joinPreservingBackslashes(workspaceAbs, raw);
  }

  const normalized = raw.replace(/\\/g, "/");
  if (isAbsolutePath(normalized)) return normalizePath(normalized);
  return resolvePath(workspaceAbs, normalized);
}

export function fileUrlToPathLike(input: string): string | null {
  try {
    const raw = String(input ?? "");
    if (!raw) return null;
    if (hasControlChar(raw)) return null;
    if (raw !== raw.trim()) return null;
    if (/\s/u.test(raw)) return null;
    if (hasEncodedControl(raw)) return null;

    const url = new URL(raw);
    if (url.protocol !== "file:") return null;
    let pathname = decodeURIComponent(url.pathname || "");
    if (hasControlChar(pathname)) return null;

    if (/^\/[A-Z]:\//i.test(pathname)) pathname = pathname.slice(1);
    if (url.host) {
      if (hasControlChar(url.host)) return null;
      return `//${url.host}${pathname}`;
    }

    return pathname || "/";
  } catch {
    return null;
  }
}

function encodePathSegments(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function encodeFilePathForUrl(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const windowsDrive = normalized.match(/^([A-Z]:)(?:\/(.*))?$/i);
  if (windowsDrive) {
    const drive = windowsDrive[1]!;
    const rest = encodePathSegments(windowsDrive[2] ?? "");
    if (rest) return `${drive}/${rest}`;
    return normalized.endsWith("/") ? `${drive}/` : drive;
  }
  return encodePathSegments(normalized);
}

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

function sanitizeRawFileUrl(raw: string): string | undefined {
  if (raw !== raw.trim()) return undefined;
  if (/\s/u.test(raw)) return undefined;
  if (raw.includes("\\")) return undefined;
  if (hasControlChar(raw)) return undefined;
  if (hasEncodedControl(raw)) return undefined;

  try {
    const url = new URL(raw);
    if (url.protocol !== "file:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function filesystemPathToFileUrl(raw: string): string | undefined {
  const backslashUnc = raw.match(/^\\\\([^\\/]+)[\\/](.+)$/);
  if (backslashUnc) {
    const host = encodeURIComponent(backslashUnc[1]!);
    const path = encodePathSegments(backslashUnc[2]!.replace(/\\/g, "/"));
    return `file://${host}/${path}`;
  }

  const slashUnc = raw.match(/^\/\/([^/]+)\/(.+)$/);
  if (slashUnc) {
    const host = encodeURIComponent(slashUnc[1]!);
    const path = encodePathSegments(slashUnc[2]!);
    return `file://${host}/${path}`;
  }

  const normalizedRaw = raw.replace(/\\/g, "/");
  const normalized = normalizePath(normalizedRaw);
  if (!isAbsolutePath(normalized)) return undefined;

  return `file:///${encodeFilePathForUrl(normalized)}`;
}

export function pathToTerminalFileHref(pathLike: string): string | undefined {
  const raw = String(pathLike ?? "");
  if (!raw) return undefined;
  if (hasControlChar(raw)) return undefined;
  if (/^file:\/\//i.test(raw)) return sanitizeRawFileUrl(raw);
  return filesystemPathToFileUrl(raw);
}
