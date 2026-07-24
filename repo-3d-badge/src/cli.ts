#!/usr/bin/env node
/**
 * CLI entry: `repo-3d-badge <repo-url-or-owner/repo>`
 *
 * Fetches the repo's contributors + logo, builds a textured 3D badge in
 * the terminal using WebGPU (via @simon_he/vue-tui), and renders it live.
 *
 * Requires the Bun runtime + bun-webgpu for the 3D renderer.
 */

import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
  type TerminalCleanupHandle,
} from "@simon_he/vue-tui/cli";
import { fetchRepo3DData, readTokenFromEnv } from "./github.js";
import { createRepoBadgeRenderer } from "./renderer.js";
import { createRepoBadgeComponent } from "./app.js";

const DEFAULT_COLS = 82;
const DEFAULT_ROWS = 26;

function printUsageAndExit(code = 1): never {
  process.stderr.write(
    [
      "Usage: repo-3d-badge <github-repo>",
      "",
      "Examples:",
      "  repo-3d-badge vuejs/core",
      "  repo-3d-badge https://github.com/facebook/react",
      "",
      "Options:",
      "  GITHUB_TOKEN / GH_TOKEN   Optional token to raise API rate limits.",
      "  VT_MAX_CONTRIBUTORS       Max contributors to fetch (default 100).",
      "",
    ].join("\n") + "\n",
  );
  process.exit(code);
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg || arg === "--help" || arg === "-h") printUsageAndExit(arg ? 0 : 1);
  // arg is now narrowed to string (printUsageAndExit is `never` for the falsy path)

  const smoke = process.env.VT_SMOKE === "1";
  const maxContributors = Number(process.env.VT_MAX_CONTRIBUTORS) > 0
    ? Number(process.env.VT_MAX_CONTRIBUTORS)
    : 100;
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const staticPreview = !smoke && !interactive;
  const cols = Number.isFinite(process.stdout.columns) ? process.stdout.columns : DEFAULT_COLS;
  const rows = Number.isFinite(process.stdout.rows) ? process.stdout.rows : DEFAULT_ROWS;

  process.stderr.write(`Fetching repo data for: ${arg}\n`);
  const token = readTokenFromEnv();
  const data = await fetchRepo3DData(arg, { token, maxContributors });
  process.stderr.write(
    `  → ${data.meta.fullName} · ⭐ ${data.meta.stargazersCount} · ${data.contributors.length} contributors · logo: ${data.logo.source}\n`,
  );

  process.stderr.write("Building 3D renderer (logo SDF + avatar atlas)…\n");
  const resolvedResult = await createRepoBadgeRenderer(data);
  const buildResult = Promise.resolve(resolvedResult);

  const { component, refs } = createRepoBadgeComponent(data, buildResult, {
    cols,
    rows,
    smoke,
  });

  const app = createTerminalApp({
    cols,
    rows,
    component,
    defaultStyle: { fg: "white", bg: "black" },
  });
  app.mount();

  const output = createStdoutRenderer(
    app.terminal,
    smoke
      ? {
          output: { isTTY: false, write: () => {} } as any,
          clear: false,
          hideCursor: false,
          altScreen: false,
          colorMode: "truecolor",
        }
      : staticPreview
        ? {
            output: process.stdout,
            clear: false,
            hideCursor: false,
            altScreen: false,
            colorMode: "truecolor",
          }
        : {
            output: process.stdout,
            hideCursor: true,
            allowFileUrls: true,
            colorMode: "truecolor",
          },
  );
  app.scheduler.flushNow();

  let driver: ReturnType<typeof createStdinDriver> | null = null;
  let cleanupHandle: TerminalCleanupHandle | null = null;
  let disposed = false;

  function onResize(): void {
    const c = Number.isFinite(process.stdout.columns) ? process.stdout.columns : DEFAULT_COLS;
    const r = Number.isFinite(process.stdout.rows) ? process.stdout.rows : DEFAULT_ROWS;
    refs.cols.value = c;
    refs.rows.value = r;
    app.terminal.resize(c, r);
    app.scheduler.flushNow();
  }

  function cleanup(): void {
    if (disposed) return;
    disposed = true;
    if (process.stdout.isTTY) process.stdout.off("resize", onResize);
    cleanupHandle?.uninstall();
    cleanupHandle = null;
    driver?.dispose();
    driver = null;
    output.dispose();
    app.dispose();
  }

  function exit(): void {
    cleanup();
    process.exit(0);
  }

  if (smoke) {
    // Wait for the renderer build + one frame, then snapshot and exit.
    try {
      await buildResult;
      // Give the viewport a moment to mount + render.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      app.scheduler.flushNow();
      const snapshot = app.terminal.snapshot().lines.join("\n");
      if (!snapshot.includes("3D BADGE") && !snapshot.includes("CONTRIBUTORS")) {
        throw new Error("smoke snapshot is incomplete");
      }
    } catch (err) {
      process.stderr.write(`Smoke test failed: ${err}\n`);
      process.exitCode = 1;
    } finally {
      cleanup();
    }
    return;
  }

  if (staticPreview) {
    try {
      await buildResult;
      await new Promise((resolve) => setTimeout(resolve, 3000));
      app.scheduler.flushNow();
      process.stderr.write(
        "\nRendered one static frame (stdin/stdout is not a TTY).\n" +
          "Run directly in a terminal for mouse orbit and animation.\n",
      );
    } catch (err) {
      process.stderr.write(`Render failed: ${err}\n`);
      process.exitCode = 1;
    } finally {
      cleanup();
    }
    return;
  }

  // Interactive TTY.
  process.stdout.on("resize", onResize);
  cleanupHandle = installTerminalCleanup(cleanup, {
    signalPolicy: "exit",
    cleanupOnUnhandledRejection: true,
    rethrowUnhandledRejection: true,
  });
  driver = createStdinDriver({
    dispatch(event) {
      if (
        event.type === "keydown" &&
        event.key.toLowerCase() === "q" &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        exit();
        return true;
      }
      const prevented = app.events.dispatch(event);
      app.scheduler.flushNow();
      return prevented;
    },
    enableMouse: true,
    enableMouseMotion: true,
    onExit: exit,
  });
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
