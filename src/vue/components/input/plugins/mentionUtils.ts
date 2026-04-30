import type { Style } from "../../../../core/types.js";
import { sanitizeInlineText } from "../../../utils/text.js";

const PASTE_IMAGE_PLACEHOLDER_PREFIX = "__paste_image_pending__:";
const COMMIT_MENTION_PREFIX = "git:commit:";
const COMMIT_ID_RE = /^[0-9a-f]{7,40}$/i;

export function isCommitMention(value: string): boolean {
  return Boolean(getCommitIdFromMention(value));
}

export function getCommitIdFromMention(value: string): string | null {
  const raw = String(value || "");
  if (!raw.startsWith(COMMIT_MENTION_PREFIX)) return null;
  const sha = raw.slice(COMMIT_MENTION_PREFIX.length).trim();
  if (!COMMIT_ID_RE.test(sha)) return null;
  return sha;
}

export function createPasteImagePlaceholderPath(id: number): string {
  return `${PASTE_IMAGE_PLACEHOLDER_PREFIX}${id}`;
}

export function isPasteImagePlaceholderPath(absPath: string): boolean {
  return String(absPath || "").startsWith(PASTE_IMAGE_PLACEHOLDER_PREFIX);
}

function pasteImagePlaceholderLabel(): string {
  return "[Pasting image...]";
}

export function basenameFromPath(path: string): string {
  const p = String(path || "");
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  const name = idx >= 0 ? p.slice(idx + 1) : p;
  return name || p;
}

export function getFileExtension(path: string): string {
  const lastDotIndex = path.lastIndexOf(".");
  if (lastDotIndex === -1) return "";
  return path.slice(lastDotIndex + 1).toLowerCase();
}

export function isImageFile(extension: string): boolean {
  return ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"].includes(extension);
}

export function isVideoFile(extension: string): boolean {
  return ["mp4", "webm", "ogg", "avi", "mov", "mkv", "flv", "wmv"].includes(extension);
}

export function isAudioFile(extension: string): boolean {
  return ["mp3", "wav", "ogg", "flac", "m4a", "wma"].includes(extension);
}

export function isDocumentFile(extension: string): boolean {
  return ["pdf", "doc", "docx", "txt", "rtf", "odt"].includes(extension);
}

export function isCodeFile(extension: string): boolean {
  return [
    "js",
    "ts",
    "jsx",
    "tsx",
    "html",
    "css",
    "scss",
    "less",
    "json",
    "xml",
    "yml",
    "yaml",
    "md",
    "markdown",
    "py",
    "java",
    "cpp",
    "c",
    "go",
    "rb",
    "php",
  ].includes(extension);
}

function isCachedPasteImage(absPath: string): boolean {
  const p = String(absPath || "").replace(/\\/g, "/");
  if (!/\/blob-cache\/[^/]+\/attachments\/[^/]+$/.test(p)) return false;
  const name = basenameFromPath(p);
  const extension = getFileExtension(name);
  return isImageFile(extension);
}

export function mentionLabelFromAbsPath(
  absPath: string,
  opts?: Readonly<{ index?: number }>,
): string {
  if (!absPath) return "[file]";
  const commitId = getCommitIdFromMention(absPath);
  if (commitId) return `[${sanitizeInlineText(commitId)}]`;
  if (isPasteImagePlaceholderPath(absPath)) return pasteImagePlaceholderLabel();
  if (isCachedPasteImage(absPath) && typeof opts?.index === "number" && opts.index >= 0) {
    return `[Image #${opts.index + 1}]`;
  }
  const name = basenameFromPath(absPath);
  return `[${sanitizeInlineText(name)}]`;
}

export type MentionFsKind = "file" | "directory" | "other";

export function mentionChipStyle(
  baseStyle: Style,
  _absPath: string,
  _fsKind?: MentionFsKind,
): Style {
  return { ...baseStyle, underline: true, bold: true };
}
