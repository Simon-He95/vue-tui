import type { FsDirEntry } from "./path-provider-types.js";
import { dirname, isAbsolutePath, joinPath, normalizePath, resolvePath } from "../utils/path.js";

export type PathPickMode = "directory" | "file" | "any";

export type PathSuggestion = Readonly<{
  kind: "directory" | "file";
  display: string;
  completion: string;
  absPath: string;
}>;

export type SuggestPathsResult = Readonly<{
  baseDirAbs: string;
  dirPrefix: string;
  query: string;
  suggestions: PathSuggestion[];
}>;

function lower(s: string): string {
  return s.toLowerCase();
}

function normalizePathInputSeparators(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === "\r") continue;
    out += ch === "\\" ? "/" : ch;
  }
  return out;
}

function stripCarriageReturns(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch !== "\r") out += ch;
  }
  return out;
}

function stripLeadingDotSlash(input: string): string {
  let i = 0;
  while (i + 1 < input.length && input.charCodeAt(i) === 46 && input.charCodeAt(i + 1) === 47) {
    i += 2;
  }
  return i === 0 ? input : input.slice(i);
}

function stripLeadingSlashes(input: string): string {
  let i = 0;
  while (i < input.length && input.charCodeAt(i) === 47) i++;
  return i === 0 ? input : input.slice(i);
}

function stripTrailingSlashes(input: string): string {
  let end = input.length;
  while (end > 0 && input.charCodeAt(end - 1) === 47) end--;
  return end === input.length ? input : input.slice(0, end);
}

function collapseSlashes(input: string): string {
  let out = "";
  let previousWasSlash = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    const isSlash = ch === "/";
    if (isSlash) {
      if (!previousWasSlash) out += "/";
      previousWasSlash = true;
      continue;
    }

    out += ch;
    previousWasSlash = false;
  }

  return out;
}

function normalizeRelativePathForIgnore(input: string): string {
  return stripTrailingSlashes(
    collapseSlashes(stripLeadingSlashes(stripLeadingDotSlash(normalizePathInputSeparators(input)))),
  );
}

function fuzzyScore(name: string, query: string): number | null {
  const n = lower(name);
  const q = lower(query);
  if (!q) return 0;
  if (n === q) return 2000;
  if (n.startsWith(q)) return 1500 - (n.length - q.length);
  const idx = n.indexOf(q);
  if (idx >= 0) return 1200 - idx;

  let ni = 0;
  let qi = 0;
  let gaps = 0;
  let lastMatch = -1;
  while (ni < n.length && qi < q.length) {
    if (n[ni] === q[qi]) {
      if (lastMatch >= 0) gaps += ni - lastMatch - 1;
      lastMatch = ni;
      qi++;
    }
    ni++;
  }
  if (qi !== q.length) return null;
  const maxGaps = Math.max(4, q.length * 2);
  if (gaps > maxGaps) return null;
  return 800 - gaps;
}

export function parsePathQuery(rawInput: string): {
  dirPrefix: string;
  query: string;
} {
  const input = normalizePathInputSeparators(rawInput);
  const lastSlash = input.lastIndexOf("/");
  if (lastSlash < 0) return { dirPrefix: "", query: input };
  return {
    dirPrefix: input.slice(0, lastSlash + 1),
    query: input.slice(lastSlash + 1),
  };
}

export async function suggestPaths(
  options: Readonly<{
    workspaceAbs: string;
    input: string;
    mode: PathPickMode;
    max: number;
    showHidden?: boolean;
    listDir: (absDir: string) => Promise<FsDirEntry[]>;
    maxDepth?: number;
    shouldIgnore?: (info: Readonly<{ normalizedRelPath: string; isDir: boolean }>) => boolean;
  }>,
): Promise<SuggestPathsResult> {
  const rawWorkspace = String(options.workspaceAbs ?? "");
  const rawInput = String(options.input ?? "");
  if (!rawWorkspace || rawWorkspace.includes("\0") || rawInput.includes("\0")) {
    const safeWorkspaceAbs = normalizePath(rawWorkspace || ".");
    return {
      baseDirAbs: resolvePath(safeWorkspaceAbs, "."),
      dirPrefix: "",
      query: "",
      suggestions: [],
    };
  }

  const workspaceAbs = normalizePath(rawWorkspace);
  const input = normalizePathInputSeparators(rawInput);
  const parsed = parsePathQuery(input);
  let dirPrefix = parsed.dirPrefix;
  let query = parsed.query;

  let baseDirAbs = resolvePath(workspaceAbs, dirPrefix || ".");
  let maxDepth = options.maxDepth ?? 0;
  if (!query) maxDepth = 0;

  const allowHidden = Boolean(options.showHidden);
  const allowDir =
    options.mode === "directory" || options.mode === "any" || options.mode === "file";
  const allowFile = options.mode === "file" || options.mode === "any";

  interface ScoredItem {
    score: number;
    name: string;
    kind: "directory" | "file";
    depth: number;
    relPath: string;
  }

  const max = Math.max(0, Math.floor(options.max));
  if (max <= 0) {
    return { baseDirAbs, dirPrefix, query, suggestions: [] };
  }

  const maxDepthClamped = Math.max(0, Math.floor(maxDepth || 0));
  const keepCapacity = Math.max(500, Math.min(8_000, max * 40));
  const maxScannedDirs = Math.max(200, Math.min(6_000, 800 + maxDepthClamped * 600));
  const maxScannedEntries = Math.max(2_000, Math.min(80_000, max * 2_000));

  const scored: ScoredItem[] = [];
  let scannedDirs = 0;
  let scannedEntries = 0;
  let scanAborted = false;

  function cmpScored(a: ScoredItem, b: ScoredItem): number {
    if (a.score !== b.score) return b.score - a.score;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.name.localeCompare(b.name);
  }

  function pruneScored(): void {
    if (scored.length <= keepCapacity) return;
    scored.sort(cmpScored);
    scored.length = keepCapacity;
  }

  function scoreItem(name: string, relPath: string, q: string): number | null {
    const byName = fuzzyScore(name, q);
    const byPath = fuzzyScore(relPath, q);
    if (byName == null && byPath == null) return null;
    if (byName != null && byPath != null) return Math.max(byName + 50, byPath);
    return byName ?? byPath;
  }

  async function searchDir(
    dirAbs: string,
    currentDepth: number,
    currentRelPath: string,
    preloadedEntries?: FsDirEntry[],
  ): Promise<void> {
    if (scanAborted) return;
    if (currentDepth > maxDepth) return;
    if (dirAbs.includes("\0")) {
      scanAborted = true;
      return;
    }
    scannedDirs++;
    if (scannedDirs > maxScannedDirs) {
      scanAborted = true;
      return;
    }

    let entries: FsDirEntry[] = [];
    try {
      entries = preloadedEntries ?? (await options.listDir(dirAbs));
    } catch {
      return;
    }

    for (const e of entries) {
      if (scanAborted) return;
      scannedEntries++;
      if (scannedEntries > maxScannedEntries) {
        scanAborted = true;
        return;
      }
      if (!allowHidden && !query && e.name.startsWith(".")) continue;

      const itemRelPath = currentRelPath ? `${currentRelPath}/${e.name}` : e.name;
      const normalizedRelPath = normalizeRelativePathForIgnore(`${dirPrefix}${itemRelPath}`);
      const isDir = e.kind === "directory";
      if (options.shouldIgnore?.({ normalizedRelPath, isDir })) continue;

      if (e.kind === "directory") {
        if (!allowDir) continue;
        const score = scoreItem(e.name, itemRelPath, query);
        if (score != null) {
          scored.push({
            score,
            name: e.name,
            kind: "directory",
            depth: currentDepth,
            relPath: itemRelPath,
          });
          if (scored.length > keepCapacity * 2) pruneScored();
        }
        await searchDir(`${dirAbs}/${e.name}`, currentDepth + 1, itemRelPath);
        continue;
      }

      if (e.kind === "file") {
        if (!allowFile) continue;
        const score = scoreItem(e.name, itemRelPath, query);
        if (score != null) {
          scored.push({
            score,
            name: e.name,
            kind: "file",
            depth: currentDepth,
            relPath: itemRelPath,
          });
          if (scored.length > keepCapacity * 2) pruneScored();
        }
      }
    }
  }

  let ok = true;
  let baseEntries: FsDirEntry[] | null = null;
  try {
    baseEntries = await options.listDir(baseDirAbs);
  } catch {
    ok = false;
  }
  if (!ok && dirPrefix) {
    const fallbackQuery = stripTrailingSlashes(input);
    dirPrefix = "";
    query = fallbackQuery;
    baseDirAbs = workspaceAbs;
    maxDepth = options.maxDepth ?? 0;
    if (!query) maxDepth = 0;
    baseEntries = null;
  }
  await searchDir(baseDirAbs, 0, "", baseEntries ?? undefined);

  pruneScored();
  scored.sort(cmpScored);

  const list = max ? scored.slice(0, max) : [];
  const suggestions: PathSuggestion[] = list.map((s) => {
    const suffix = s.kind === "directory" ? "/" : "";
    const completion = `${dirPrefix}${s.relPath}${suffix}`;
    const absPath = resolvePath(workspaceAbs, `${dirPrefix}${s.relPath}`);
    return { kind: s.kind, display: completion, completion, absPath };
  });

  return { baseDirAbs, dirPrefix, query, suggestions };
}

export function resolveUserPath(
  workspaceAbs: string,
  input: string,
  options?: Readonly<{ homeDir?: string }>,
): string {
  const raw = stripCarriageReturns(input ?? "").trim();
  if (!raw) return resolvePath(normalizePath(workspaceAbs), ".");

  if (raw === "~" || raw.startsWith("~/")) {
    const home = String(options?.homeDir ?? "").trim();
    if (home) {
      const rest = raw === "~" ? "" : raw.slice(2);
      return resolvePath(normalizePath(home), rest);
    }
  }

  const normalized = normalizePathInputSeparators(raw);
  if (isAbsolutePath(normalized)) return normalizePath(normalized);
  return resolvePath(normalizePath(workspaceAbs), normalized);
}

export function suggestParentHint(path: string): string {
  const p = normalizePath(path);
  const d = dirname(p);
  return d ? joinPath(d, "..") : "..";
}
