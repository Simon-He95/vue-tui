import type { FsDirEntry } from "./path-provider.js";
import type { PathPickMode, SuggestPathsResult } from "./path-suggest-core.js";
import process from "node:process";
import { normalizePath, resolvePath } from "../utils/path.js";
import {
  resolveUserPath as resolveUserPathCore,
  suggestPaths as suggestPathsCore,
} from "./path-suggest-core.js";

export type { PathPickMode, PathSuggestion, SuggestPathsResult } from "./path-suggest-core.js";
export { parsePathQuery, suggestParentHint } from "./path-suggest-core.js";

type GitignoreRule =
  | Readonly<{
      kind: "segment";
      negative: boolean;
      directoryOnly: boolean;
      regex: RegExp;
    }>
  | Readonly<{
      kind: "path";
      negative: boolean;
      directoryOnly: boolean;
      regex: RegExp;
    }>;

const DEFAULT_IGNORED_SEGMENTS = new Set([".git", "node_modules", "dist", "cache", ".cache"]);

const EMPTY_GITIGNORE_RULES: readonly GitignoreRule[] = [];
const gitignoreRulesCache = new Map<string, readonly GitignoreRule[]>();
const gitignoreRulesLoading = new Map<string, Promise<readonly GitignoreRule[]>>();

function isNodeLike(): boolean {
  const proc: any = process;
  return typeof proc?.versions?.node === "string";
}

function loadGitignoreRulesAsync(workspaceAbs: string): Promise<readonly GitignoreRule[]> {
  const key = normalizePath(workspaceAbs);
  return (async () => {
    if (!isNodeLike()) return EMPTY_GITIGNORE_RULES;
    try {
      const fs = await import("node:fs/promises");
      const gitignoreAbs = resolvePath(key, ".gitignore");
      const content = await fs.readFile(gitignoreAbs, "utf8");
      return compileGitignoreRules(content);
    } catch {
      return EMPTY_GITIGNORE_RULES;
    }
  })();
}

function startGitignoreLoad(workspaceAbs: string): Promise<readonly GitignoreRule[]> {
  const key = normalizePath(workspaceAbs);
  const existing = gitignoreRulesLoading.get(key);
  if (existing) return existing;

  const promise = loadGitignoreRulesAsync(key);
  gitignoreRulesLoading.set(key, promise);
  void promise
    .then((rules) => {
      gitignoreRulesCache.set(key, rules);
      gitignoreRulesLoading.delete(key);
    })
    .catch(() => {
      gitignoreRulesCache.set(key, EMPTY_GITIGNORE_RULES);
      gitignoreRulesLoading.delete(key);
    });
  return promise;
}

async function loadGitignoreRules(workspaceAbs: string): Promise<readonly GitignoreRule[]> {
  const key = normalizePath(workspaceAbs);
  const cached = gitignoreRulesCache.get(key);
  if (cached) return cached;
  const pending = gitignoreRulesLoading.get(key) ?? startGitignoreLoad(key);
  return pending;
}

function peekGitignoreRules(workspaceAbs: string): readonly GitignoreRule[] {
  const key = normalizePath(workspaceAbs);
  const cached = gitignoreRulesCache.get(key);
  if (cached) return cached;
  void startGitignoreLoad(key);
  return EMPTY_GITIGNORE_RULES;
}

function escapeRegexLiteral(ch: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(ch) ? `\\${ch}` : ch;
}

function globToRegexSource(pattern: string, opts: Readonly<{ allowSlash: boolean }>): string {
  const allowSlash = opts.allowSlash;
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // Collapse consecutive stars into a single "match anything" segment.
        while (pattern[i + 1] === "*") i++;
        out += ".*";
      } else {
        out += allowSlash ? "[^/]*" : ".*";
      }
      continue;
    }
    if (ch === "?") {
      out += allowSlash ? "[^/]" : ".";
      continue;
    }
    out += escapeRegexLiteral(ch);
  }
  return out;
}

function compileSegmentRule(
  rawPattern: string,
  opts: Readonly<{ negative: boolean; directoryOnly: boolean }>,
): GitignoreRule | null {
  const pattern = rawPattern.trim();
  if (!pattern) return null;
  const source = globToRegexSource(pattern, { allowSlash: false });
  return {
    kind: "segment",
    negative: opts.negative,
    directoryOnly: opts.directoryOnly,
    regex: new RegExp(`^${source}$`),
  };
}

function compilePathRule(
  rawPattern: string,
  opts: Readonly<{ negative: boolean; directoryOnly: boolean }>,
): GitignoreRule | null {
  let pattern = rawPattern.trim().replace(/\\/g, "/");
  if (!pattern) return null;
  if (pattern.startsWith("/")) pattern = pattern.slice(1);
  if (!pattern) return null;

  let prefix = "^";
  if (pattern.startsWith("**/")) {
    prefix += "(?:.*\\/)?";
    pattern = pattern.slice(3);
  }

  const body = globToRegexSource(pattern, { allowSlash: true });
  const suffix = opts.directoryOnly ? "(?:\\/.*)?$" : "$";

  return {
    kind: "path",
    negative: opts.negative,
    directoryOnly: opts.directoryOnly,
    regex: new RegExp(`${prefix}${body}${suffix}`),
  };
}

function compileGitignoreRules(content: string): readonly GitignoreRule[] {
  const lines = content.split(/\r?\n/);
  const rules: GitignoreRule[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;

    let negative = false;
    let line = trimmed;
    if (line.startsWith("!")) {
      negative = true;
      line = line.slice(1).trim();
      if (!line) continue;
    }

    let directoryOnly = false;
    if (line.endsWith("/")) {
      directoryOnly = true;
      line = line.replace(/\/+$/g, "");
      if (!line) continue;
    }

    line = line.replace(/\\/g, "/");
    if (line.startsWith("./")) line = line.slice(2);
    if (!line) continue;

    const hasSlash = line.includes("/");
    const rule = hasSlash
      ? compilePathRule(line, { negative, directoryOnly })
      : compileSegmentRule(line, { negative, directoryOnly });
    if (rule) rules.push(rule);
  }

  return rules;
}

function shouldIgnoreByDefault(normalizedRelPath: string): boolean {
  if (!normalizedRelPath) return false;
  const segments = normalizedRelPath.split("/").filter(Boolean);
  for (const seg of segments) {
    if (DEFAULT_IGNORED_SEGMENTS.has(seg)) return true;
  }
  return false;
}

function isGitignored(
  normalizedRelPath: string,
  opts: Readonly<{ isDir: boolean; rules: readonly GitignoreRule[] }>,
): boolean {
  const rel = normalizedRelPath;
  if (!rel) return false;
  const rules = opts.rules;
  if (!rules.length) return false;

  const segments = rel.split("/").filter(Boolean);
  if (!segments.length) return false;

  const prefixes: string[] = [];
  let acc = "";
  for (const seg of segments) {
    acc = acc ? `${acc}/${seg}` : seg;
    prefixes.push(acc);
  }

  let ignored = false;

  for (const rule of rules) {
    if (rule.kind === "segment") {
      const pool = rule.directoryOnly ? (opts.isDir ? segments : segments.slice(0, -1)) : segments;
      if (pool.some((s) => rule.regex.test(s))) ignored = !rule.negative;
      continue;
    }

    const pool = rule.directoryOnly ? (opts.isDir ? prefixes : prefixes.slice(0, -1)) : prefixes;
    if (pool.some((p) => rule.regex.test(p))) ignored = !rule.negative;
  }

  return ignored;
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
    gitignore?: "blocking" | "nonBlocking";
  }>,
): Promise<SuggestPathsResult> {
  const workspaceAbs = normalizePath(String(options.workspaceAbs ?? ""));
  const gitignoreMode = options.gitignore ?? "blocking";
  const gitignoreRules =
    gitignoreMode === "nonBlocking"
      ? peekGitignoreRules(workspaceAbs)
      : await loadGitignoreRules(workspaceAbs);
  return suggestPathsCore({
    ...options,
    workspaceAbs,
    shouldIgnore: ({ normalizedRelPath, isDir }) =>
      shouldIgnoreByDefault(normalizedRelPath) ||
      isGitignored(normalizedRelPath, { isDir, rules: gitignoreRules }),
  });
}

export function resolveUserPath(workspaceAbs: string, input: string): string {
  const env = process?.env ?? {};
  return resolveUserPathCore(workspaceAbs, input, {
    homeDir: String(env.HOME || env.USERPROFILE || ""),
  });
}
