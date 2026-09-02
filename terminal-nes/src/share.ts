/**
 * NES terminal game — share + leaderboard helpers.
 *
 * Generates a share-ready post for X (Twitter): a screenshot PNG of the
 * current NES frame, a one-line caption with the vue-tui repo, and a local
 * leaderboard entry so players can compete for play time / score.
 *
 * The screenshot is written to <cwd>/.nes-shares/ and the caption is copied
 * to the clipboard when `pbcopy`/`xclip`/`xsel` is available.
 */
import { execFile, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { encodeRgbaPng } from "./png.js";

const VUE_TUI_URL = "https://github.com/Simon-He95/vue-tui";
const SHARE_DIR = join(process.cwd(), ".nes-shares");
const LEADERBOARD_DIR = join(homedir(), ".vue-tui-nes");
const LEADERBOARD_FILE = join(LEADERBOARD_DIR, "leaderboard.json");

export type LeaderboardEntry = {
  player: string;
  score: number;
  playMs: number;
  rom: string;
  date: string;
};

export function getLeaderboard(): LeaderboardEntry[] {
  try {
    if (!existsSync(LEADERBOARD_FILE)) return [];
    return JSON.parse(readFileSync(LEADERBOARD_FILE, "utf8")) as LeaderboardEntry[];
  } catch {
    return [];
  }
}

export function recordLeaderboard(entry: LeaderboardEntry): LeaderboardEntry[] {
  const all = [...getLeaderboard(), entry]
    .sort((a, b) => b.score - a.score || b.playMs - a.playMs)
    .slice(0, 20);
  try {
    mkdirSync(LEADERBOARD_DIR, { recursive: true });
    writeFileSync(LEADERBOARD_FILE, JSON.stringify(all, null, 2));
  } catch {
    // leaderboard is best-effort
  }
  return all;
}

export type ShareResult = {
  caption: string;
  pngPath: string | null;
  copied: boolean;
  rank: number | null;
  leaderboard: LeaderboardEntry[];
};

/**
 * Save the current frame as PNG, build a share caption, copy it to the
 * clipboard (best effort) and record the local leaderboard entry.
 */
export function shareToX(options: {
  rom: string;
  player: string;
  score?: number;
  playMs?: number;
  frameRgba: Uint8Array;
  frameW: number;
  frameH: number;
  postfix?: string;
}): ShareResult {
  const { rom, player, score, playMs, frameRgba, frameW, frameH, postfix } = options;
  const entry: LeaderboardEntry = {
    player,
    score: score ?? 0,
    playMs: playMs ?? 0,
    rom,
    date: new Date().toISOString(),
  };
  const ranked = recordLeaderboard(entry);
  const rank = ranked.indexOf(entry) + 1;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let pngPath: string | null = null;
  try {
    mkdirSync(SHARE_DIR, { recursive: true });
    pngPath = join(SHARE_DIR, `nes-${stamp}.png`);
    writeFileSync(pngPath, encodeRgbaPng(frameRgba, frameW, frameH));
  } catch {
    // screenshot save is best-effort
  }

  const scoreText = score != null ? `score ${score}` : "";
  const timeText = playMs != null && playMs > 0 ? `${(playMs / 1000).toFixed(1)}s of play` : "";
  const bits = [scoreText, timeText].filter(Boolean).join(" · ");
  const caption = [
    `🕹️ Playing ${rom} in my terminal — ${bits || "one life at a time"}`,
    `Rendered by @simon_he/vue-tui (Vue 3 terminal UI) — all in the terminal, no browser!`,
    VUE_TUI_URL,
    postfix ?? "",
    "#vueTui #terminalUI #retroGaming #NEStalgia",
  ]
    .filter(Boolean)
    .join("\n");

  // Clipboard best-effort: macOS pbcopy, Linux xclip/xsel.
  let copied = false;
  for (const tool of [
    { cmd: "pbcopy", args: [] },
    { cmd: "xclip", args: ["-selection", "clipboard"] },
    { cmd: "xsel", args: ["-b"] },
  ]) {
    try {
      const res = spawnSync(tool.cmd, tool.args, {
        input: caption,
        encoding: "utf8",
        stdio: ["pipe", "ignore", "ignore"],
      });
      if (res.status === 0) {
        copied = true;
        break;
      }
    } catch {
      // try next clipboard tool
    }
  }

  return {
    caption,
    pngPath,
    copied,
    rank: rank > 0 ? rank : null,
    leaderboard: ranked.slice(0, 5),
  };
}

export function listRoms(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".nes"))
      .map((f) => join(dir, f))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Put a PNG file on the system clipboard (macOS via osascript, Linux via
 * xclip image target). Returns true when the image is ready to paste.
 */
export function copyPngToClipboard(pngPath: string): boolean {
  const current = platform();
  try {
    if (current === "darwin") {
      // AppleScript reads the file as PNG data into the clipboard.
      const script = `set the clipboard to (read (POSIX file ${JSON.stringify(pngPath)}) as «class PNGf»)\n`;
      const res = spawnSync("osascript", ["-e", script], {
        encoding: "utf8",
        stdio: ["pipe", "ignore", "ignore"],
      });
      return res.status === 0;
    }
    if (current === "linux") {
      const res = spawnSync("xclip", ["-selection", "clipboard", "-t", "image/png", "-i"], {
        input: readFileSync(pngPath),
        stdio: ["pipe", "ignore", "ignore"],
      });
      return res.status === 0;
    }
  } catch {
    // fall through
  }
  return false;
}

/**
 * Open the X (Twitter) composer in the default browser with the caption
 * pre-filled. X's web flow requires the image to be pasted manually — the
 * image itself is already on the clipboard via copyPngToClipboard.
 *
 * Returns true when the browser launch command was dispatched.
 */
export function openBrowserToX(caption: string): boolean {
  const intentUrl =
    "https://x.com/intent/tweet?text=" + encodeURIComponent(normalizeCaption(caption));
  const onComplete = (error: Error | null) => {
    // Opening a browser is best-effort; errors are intentionally ignored.
    void error;
  };
  try {
    if (platform() === "darwin") execFile("open", [intentUrl], { windowsHide: true }, onComplete);
    else if (platform() === "win32")
      execFile("explorer.exe", [intentUrl], { windowsHide: true }, onComplete);
    else execFile("xdg-open", [intentUrl], { windowsHide: true }, onComplete);
    return true;
  } catch {
    return false;
  }
}

/** X collapses newlines in the composer; make it single-line and compact. */
export function normalizeCaption(caption: string): string {
  return caption
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

export { VUE_TUI_URL, SHARE_DIR };
