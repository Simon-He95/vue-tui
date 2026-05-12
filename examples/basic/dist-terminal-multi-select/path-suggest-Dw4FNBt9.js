import process from "node:process";
import { r as resolvePath, n as normalizePath, i as isAbsolutePath } from "./terminal-multi-select-qND_iMwz.js";
function lower(s) {
  return s.toLowerCase();
}
function fuzzyScore(name, query) {
  const n = lower(name);
  const q = lower(query);
  if (!q) return 0;
  if (n === q) return 2e3;
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
function parsePathQuery(rawInput) {
  const input = rawInput.replace(/\\/g, "/");
  const lastSlash = input.lastIndexOf("/");
  if (lastSlash < 0) return { dirPrefix: "", query: input };
  return {
    dirPrefix: input.slice(0, lastSlash + 1),
    query: input.slice(lastSlash + 1)
  };
}
async function suggestPaths$1(options) {
  const rawWorkspace = String(options.workspaceAbs ?? "");
  const rawInput = String(options.input ?? "");
  if (!rawWorkspace || rawWorkspace.includes("\0") || rawInput.includes("\0")) {
    const safeWorkspaceAbs = normalizePath(rawWorkspace || ".");
    return {
      baseDirAbs: resolvePath(safeWorkspaceAbs, "."),
      dirPrefix: "",
      query: "",
      suggestions: []
    };
  }
  const workspaceAbs = normalizePath(rawWorkspace);
  const input = rawInput.replace(/\r/g, "").replace(/\\/g, "/");
  const parsed = parsePathQuery(input);
  let dirPrefix = parsed.dirPrefix;
  let query = parsed.query;
  let baseDirAbs = resolvePath(workspaceAbs, dirPrefix || ".");
  let maxDepth = options.maxDepth ?? 0;
  if (!query) maxDepth = 0;
  const allowHidden = Boolean(options.showHidden);
  const allowDir = options.mode === "directory" || options.mode === "any" || options.mode === "file";
  const allowFile = options.mode === "file" || options.mode === "any";
  const max = Math.max(0, Math.floor(options.max));
  if (max <= 0) {
    return { baseDirAbs, dirPrefix, query, suggestions: [] };
  }
  const maxDepthClamped = Math.max(0, Math.floor(maxDepth || 0));
  const keepCapacity = Math.max(500, Math.min(8e3, max * 40));
  const maxScannedDirs = Math.max(200, Math.min(6e3, 800 + maxDepthClamped * 600));
  const maxScannedEntries = Math.max(2e3, Math.min(8e4, max * 2e3));
  const scored = [];
  let scannedDirs = 0;
  let scannedEntries = 0;
  let scanAborted = false;
  function cmpScored(a, b) {
    if (a.score !== b.score) return b.score - a.score;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.name.localeCompare(b.name);
  }
  function pruneScored() {
    if (scored.length <= keepCapacity) return;
    scored.sort(cmpScored);
    scored.length = keepCapacity;
  }
  function scoreItem(name, relPath, q) {
    const byName = fuzzyScore(name, q);
    const byPath = fuzzyScore(relPath, q);
    if (byName == null && byPath == null) return null;
    if (byName != null && byPath != null) return Math.max(byName + 50, byPath);
    return byName ?? byPath;
  }
  async function searchDir(dirAbs, currentDepth, currentRelPath, preloadedEntries) {
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
    let entries = [];
    try {
      entries = preloadedEntries ?? await options.listDir(dirAbs);
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
      const normalizedRelPath = String(`${dirPrefix}${itemRelPath}`).replace(/\r/g, "").replace(/\\/g, "/").replace(/^(?:\.\/)+/g, "").replace(/^\/+/g, "").replace(/\/+/g, "/").replace(/\/+$/g, "");
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
            relPath: itemRelPath
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
            relPath: itemRelPath
          });
          if (scored.length > keepCapacity * 2) pruneScored();
        }
      }
    }
  }
  let ok = true;
  let baseEntries = null;
  try {
    baseEntries = await options.listDir(baseDirAbs);
  } catch {
    ok = false;
  }
  if (!ok && dirPrefix) {
    const fallbackQuery = input.replace(/\/+$/g, "");
    dirPrefix = "";
    query = fallbackQuery;
    baseDirAbs = workspaceAbs;
    maxDepth = options.maxDepth ?? 0;
    if (!query) maxDepth = 0;
    baseEntries = null;
  }
  await searchDir(baseDirAbs, 0, "", baseEntries ?? void 0);
  pruneScored();
  scored.sort(cmpScored);
  const list = max ? scored.slice(0, max) : [];
  const suggestions = list.map((s) => {
    const suffix = s.kind === "directory" ? "/" : "";
    const completion = `${dirPrefix}${s.relPath}${suffix}`;
    const absPath = resolvePath(workspaceAbs, `${dirPrefix}${s.relPath}`);
    return { kind: s.kind, display: completion, completion, absPath };
  });
  return { baseDirAbs, dirPrefix, query, suggestions };
}
function resolveUserPath$1(workspaceAbs, input, options) {
  const raw = (input ?? "").replace(/\r/g, "").trim();
  if (!raw) return resolvePath(normalizePath(workspaceAbs), ".");
  if (raw === "~" || raw.startsWith("~/")) {
    const home = String(options?.homeDir ?? "").trim();
    if (home) {
      const rest = raw === "~" ? "" : raw.slice(2);
      return resolvePath(normalizePath(home), rest);
    }
  }
  const normalized = raw.replace(/\\/g, "/");
  if (isAbsolutePath(normalized)) return normalizePath(normalized);
  return resolvePath(normalizePath(workspaceAbs), normalized);
}
const DEFAULT_IGNORED_SEGMENTS = /* @__PURE__ */ new Set([".git", "node_modules", "dist", "cache", ".cache"]);
const EMPTY_GITIGNORE_RULES = [];
const gitignoreRulesCache = /* @__PURE__ */ new Map();
const gitignoreRulesLoading = /* @__PURE__ */ new Map();
function isNodeLike() {
  const proc = process;
  return typeof proc?.versions?.node === "string";
}
function loadGitignoreRulesAsync(workspaceAbs) {
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
function startGitignoreLoad(workspaceAbs) {
  const key = normalizePath(workspaceAbs);
  const existing = gitignoreRulesLoading.get(key);
  if (existing) return existing;
  const promise = loadGitignoreRulesAsync(key);
  gitignoreRulesLoading.set(key, promise);
  void promise.then((rules) => {
    gitignoreRulesCache.set(key, rules);
    gitignoreRulesLoading.delete(key);
  }).catch(() => {
    gitignoreRulesCache.set(key, EMPTY_GITIGNORE_RULES);
    gitignoreRulesLoading.delete(key);
  });
  return promise;
}
async function loadGitignoreRules(workspaceAbs) {
  const key = normalizePath(workspaceAbs);
  const cached = gitignoreRulesCache.get(key);
  if (cached) return cached;
  const pending = gitignoreRulesLoading.get(key) ?? startGitignoreLoad(key);
  return pending;
}
function peekGitignoreRules(workspaceAbs) {
  const key = normalizePath(workspaceAbs);
  const cached = gitignoreRulesCache.get(key);
  if (cached) return cached;
  void startGitignoreLoad(key);
  return EMPTY_GITIGNORE_RULES;
}
function escapeRegexLiteral(ch) {
  return /[\\^$.*+?()[\]{}|]/.test(ch) ? `\\${ch}` : ch;
}
function globToRegexSource(pattern, opts) {
  const allowSlash = opts.allowSlash;
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
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
function compileSegmentRule(rawPattern, opts) {
  const pattern = rawPattern.trim();
  if (!pattern) return null;
  const source = globToRegexSource(pattern, { allowSlash: false });
  return {
    kind: "segment",
    negative: opts.negative,
    directoryOnly: opts.directoryOnly,
    regex: new RegExp(`^${source}$`)
  };
}
function compilePathRule(rawPattern, opts) {
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
    regex: new RegExp(`${prefix}${body}${suffix}`)
  };
}
function compileGitignoreRules(content) {
  const lines = content.split(/\r?\n/);
  const rules = [];
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
    const rule = hasSlash ? compilePathRule(line, { negative, directoryOnly }) : compileSegmentRule(line, { negative, directoryOnly });
    if (rule) rules.push(rule);
  }
  return rules;
}
function shouldIgnoreByDefault(normalizedRelPath) {
  if (!normalizedRelPath) return false;
  const segments = normalizedRelPath.split("/").filter(Boolean);
  for (const seg of segments) {
    if (DEFAULT_IGNORED_SEGMENTS.has(seg)) return true;
  }
  return false;
}
function isGitignored(normalizedRelPath, opts) {
  const rel = normalizedRelPath;
  if (!rel) return false;
  const rules = opts.rules;
  if (!rules.length) return false;
  const segments = rel.split("/").filter(Boolean);
  if (!segments.length) return false;
  const prefixes = [];
  let acc = "";
  for (const seg of segments) {
    acc = acc ? `${acc}/${seg}` : seg;
    prefixes.push(acc);
  }
  let ignored = false;
  for (const rule of rules) {
    if (rule.kind === "segment") {
      const pool2 = rule.directoryOnly ? opts.isDir ? segments : segments.slice(0, -1) : segments;
      if (pool2.some((s) => rule.regex.test(s))) ignored = !rule.negative;
      continue;
    }
    const pool = rule.directoryOnly ? opts.isDir ? prefixes : prefixes.slice(0, -1) : prefixes;
    if (pool.some((p) => rule.regex.test(p))) ignored = !rule.negative;
  }
  return ignored;
}
async function suggestPaths(options) {
  const workspaceAbs = normalizePath(String(options.workspaceAbs ?? ""));
  const gitignoreMode = options.gitignore ?? "blocking";
  const gitignoreRules = gitignoreMode === "nonBlocking" ? peekGitignoreRules(workspaceAbs) : await loadGitignoreRules(workspaceAbs);
  return suggestPaths$1({
    ...options,
    workspaceAbs,
    shouldIgnore: ({ normalizedRelPath, isDir }) => shouldIgnoreByDefault(normalizedRelPath) || isGitignored(normalizedRelPath, { isDir, rules: gitignoreRules })
  });
}
function resolveUserPath(workspaceAbs, input) {
  const env = process?.env ?? {};
  return resolveUserPath$1(workspaceAbs, input, {
    homeDir: String(env.HOME || env.USERPROFILE || "")
  });
}
export {
  parsePathQuery,
  resolveUserPath,
  suggestPaths
};
