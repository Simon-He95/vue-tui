/**
 * Share pipeline smoke: render a fake frame, save a screenshot, build the X
 * caption and verify a leaderboard entry lands in ~/.vue-tui-nes.
 * Restores the leaderboard afterwards.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getLeaderboard, shareToX, VUE_TUI_URL } from "./share.js";

const LB_FILE = join(homedir(), ".vue-tui-nes", "leaderboard.json");
const before = existsSync(LB_FILE) ? readFileSync(LB_FILE, "utf8") : null;

// Fake 256×224 frame with distinct pixels.
const rgba = new Uint8Array(256 * 224 * 4);
for (let i = 0; i < 256 * 224; i++) {
  rgba[i * 4] = 200;
  rgba[i * 4 + 1] = 80;
  rgba[i * 4 + 2] = 30;
  rgba[i * 4 + 3] = 255;
}

const res = shareToX({
  rom: "falling.nes",
  player: "smoke-test-player",
  score: 1234,
  playMs: 60_000,
  frameRgba: rgba,
  frameW: 256,
  frameH: 224,
  postfix: "postfix-ok",
});

const checks = {
  pngSaved: res.pngPath !== null && existsSync(res.pngPath!),
  captionHasRepo: res.caption.includes(VUE_TUI_URL),
  captionHasHashtags: res.caption.includes("#vueTui") && res.caption.includes("#retroGaming"),
  captionHasPostfix: res.caption.includes("postfix-ok"),
  leaderboardRecorded: getLeaderboard().some(
    (e) => e.player === "smoke-test-player" && e.score === 1234,
  ),
  rankComputed: typeof res.rank === "number" && res.rank! >= 1,
};
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ...checks, firstLine: res.caption.split("\n")[0] }, null, 2));
console.log(ok ? "nes share: OK" : "nes share: FAILED");

// Restore the leaderboard exactly as it was (or remove the test file).
if (res.pngPath) rmSync(res.pngPath, { force: true });
try {
  if (before == null) {
    rmSync(LB_FILE, { force: true });
  } else {
    mkdirSync(join(homedir(), ".vue-tui-nes"), { recursive: true });
    writeFileSync(LB_FILE, before);
  }
} catch {
  // best-effort restore
}
process.exit(ok ? 0 : 1);
