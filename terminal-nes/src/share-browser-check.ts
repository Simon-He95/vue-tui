/**
 * Verify the browser-launch URL is well-formed and the PNG→clipboard path
 * works (up to the clipboard write; does NOT actually open a browser).
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeRgbaPng } from "./png.js";
import { copyPngToClipboard, normalizeCaption } from "./share.js";

const rgba = new Uint8Array(2 * 2 * 4);
rgba.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
const pngPath = join(tmpdir(), "nes-clip-test.png");
writeFileSync(pngPath, encodeRgbaPng(rgba, 2, 2));

const caption = "Line one\nLine two https://github.com/Simon-He95/vue-tui #vueTui";
const normalized = normalizeCaption(caption);
const intentUrl = "https://x.com/intent/tweet?text=" + encodeURIComponent(normalized);

const checks = {
  captionSingleLine: !normalized.includes("\n"),
  captionHasRepo: normalized.includes("github.com/Simon-He95/vue-tui"),
  captionHasTag: normalized.includes("#vueTui"),
  urlEncoded: !intentUrl.includes(" "),
  pngCopied: copyPngToClipboard(pngPath),
};
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ...checks, intentUrl }, null, 2));
console.log(ok ? "nes share browser: OK" : "nes share browser: FAILED");
process.exit(ok ? 0 : 1);
