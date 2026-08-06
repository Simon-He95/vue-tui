/**
 * Terminal graphics / math image diagnostics.
 *
 * Run inside the terminal you want to debug:
 *   bun run tsx scripts/check-math-graphics.ts
 *
 * Prints the detected graphics protocol, the math rasterizer status, and a
 * sample rasterized formula so you can tell exactly which gate blocked the
 * Kitty image path.
 */
import { detectTerminalGraphicsCapabilities } from "../src/renderer/terminal-graphics.js";
import { getMarkdownMathImage, loadMarkdownMathImageRenderer } from "../src/markdown.js";

function env(key: string): string | undefined {
  const processLike = globalThis as { process?: { env?: Record<string, unknown> } };
  const value = processLike.process?.env?.[key];
  return value == null ? undefined : String(value);
}

async function main(): Promise<void> {
  console.log("=== environment ===");
  for (const key of [
    "TERM",
    "TERM_PROGRAM",
    "TERM_PROGRAM_VERSION",
    "COLORTERM",
    "GHOSTTY_RESOURCES_DIR",
    "KITTY_WINDOW_ID",
    "TMUX",
    "STY",
    "ZELLIJ",
    "CI",
  ]) {
    console.log(`  ${key}=${env(key) ?? "(unset)"}`);
  }

  console.log("\n=== graphics capability detection ===");
  const caps = detectTerminalGraphicsCapabilities();
  console.log("  protocol      :", caps.protocol);
  console.log("  supported     :", caps.supported);
  console.log("  preferred     :", caps.preferredProtocol);
  console.log("  candidates    :", caps.candidates.join(", ") || "(none)");
  console.log("  reason        :", caps.reason ?? "auto-detected");
  console.log("  stdoutIsTTY   :", caps.stdoutIsTTY);
  if (caps.multiplexer) {
    console.log("  multiplexer   :", caps.multiplexer);
    console.log("  passthrough   :", caps.passthrough);
    console.log(
      "  NOTE          : inside a multiplexer the graphics protocol is disabled",
      "unless passthrough is enabled (VUE_TUI_GRAPHICS_TMUX_PASSTHROUGH=1) or forced.",
    );
  }

  console.log("\n=== math rasterizer ===");
  const ready = await loadMarkdownMathImageRenderer();
  console.log("  rasterizer    :", ready ? "ready" : "NOT AVAILABLE");
  if (!ready) {
    console.log(
      "  install       : pnpm add mathjax-full @resvg/resvg-js  (optional peers of @simon_he/vue-tui)",
    );
    return;
  }

  const tex = "\\frac{a}{b}+\\int_0^1 x^2\\,dx";
  const result = await getMarkdownMathImage(tex, "display", {
    cellWidthPx: 8,
    cellHeightPx: 16,
    scale: 2,
    color: "#ffffff",
    maxWidthCells: 60,
  });
  if (!result) {
    console.log("  sample render : FAILED (returned null)");
    return;
  }
  console.log(
    `  sample render : ${result.widthCells}x${result.heightCells} cells, PNG ${result.base64.length} chars base64`,
  );
  if (caps.supported && caps.preferredProtocol === "kitty") {
    console.log(
      "\n  Everything is ready — the showcase should render a Kitty image.",
      "If it does not, the terminal may not be applying the graphics protocol",
      "(e.g. running under tmux, or a terminal that ignores kitty APC frames).",
    );
  } else if (caps.supported) {
    console.log(
      `\n  Graphics use ${caps.protocol}; the showcase will emit ${caps.protocol} frames.`,
    );
  } else {
    console.log("\n  Graphics are NOT supported here — the showcase will show boxed raw formulas.");
  }
}

void main();
