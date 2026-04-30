import { isAbsolutePath, normalizePath, resolvePath } from "../../../utils/path.js";

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
    const url = new URL(String(input ?? ""));
    if (url.protocol !== "file:") return null;
    let pathname = decodeURIComponent(url.pathname || "");
    if (/^\/[A-Z]:\//i.test(pathname)) pathname = pathname.slice(1);
    if (url.host) return `//${url.host}${pathname}`;
    return pathname || "/";
  } catch {
    return null;
  }
}

export function pathToTerminalFileHref(pathLike: string): string | undefined {
  const raw = String(pathLike ?? "").trim();
  if (!raw) return undefined;
  if (raw.startsWith("file://")) return raw;

  const normalizedRaw = raw.replace(/\\/g, "/");
  const normalized = normalizePath(normalizedRaw);
  if (!isAbsolutePath(normalized)) return undefined;

  try {
    if (/^[A-Z]:\//i.test(normalized)) {
      return new URL(`file:///${normalized}`).toString();
    }
    return new URL(`file://${normalized}`).toString();
  } catch {
    return undefined;
  }
}
