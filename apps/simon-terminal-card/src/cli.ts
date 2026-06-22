#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { hasFlag, readOption, resolveUsernameArg } from "./args.js";
import { makeCardComponent } from "./card.js";
import { defaultUser, outputName } from "./constants.js";
import {
  fetchLiveSnapshot,
  readCachedSnapshot,
  writeCachedSnapshot,
  writeUserCachedSnapshot,
} from "./github-data.js";
import { createLoadingStatus } from "./loading.js";
import {
  detectStdoutGraphicsCapabilities,
  mountInteractiveComponent,
  printAnsiComponent,
  renderComponent,
  stdoutAvatarMode,
  terminalAnsi,
  writeTerminalSvg,
} from "./render.js";
import type { CardSnapshot, DataSource } from "./types.js";

export { resolveUsernameArg } from "./args.js";
export { maskPngBase64ToCircle } from "./avatar.js";
export { makeCardComponent } from "./card.js";
export { fetchLiveSnapshot, readCachedSnapshot } from "./github-data.js";
export { createLoadingStatus } from "./loading.js";
export { openExternalHref, renderComponent, stdoutAvatarMode, terminalAnsi } from "./render.js";

export async function main(): Promise<void> {
  const username = resolveUsernameArg();
  const outOption = readOption("--out");
  const outDir = outOption ? resolve(outOption) : null;
  const loading = createLoadingStatus();
  const cached = readCachedSnapshot(username);
  let source: DataSource = "live";
  let snapshot: CardSnapshot;
  try {
    snapshot = await fetchLiveSnapshot(username, cached, loading);
    try {
      writeUserCachedSnapshot(snapshot);
    } catch {
      // Local cache is best-effort; live rendering should not fail when cache writes fail.
    }
    if (hasFlag("--update-cache") && username.toLowerCase() === defaultUser.toLowerCase()) {
      writeCachedSnapshot(snapshot);
    }
  } catch (error) {
    if (!cached) {
      loading.stop();
      throw error;
    }
    source = "cached";
    snapshot = cached;
    loading.set("GitHub fetch failed; using cached card snapshot...");
    if (!process.stderr.isTTY)
      process.stderr.write("GitHub fetch failed; using cached snapshot.\n");
  }
  loading.set("Rendering TContributionGraph card...");
  const shouldRenderSnapshot = Boolean(outDir) || !process.stdout.isTTY;
  if (shouldRenderSnapshot) {
    const fileComponent = makeCardComponent({ ...snapshot, source, avatarMode: "cells" });
    const rendered = await renderComponent(fileComponent);
    try {
      if (outDir) writeTerminalSvg(outputName, rendered.terminal, outDir);
      loading.stop(source === "cached" ? "Rendered cached GitHub snapshot." : undefined);
      if (!hasFlag("--no-ansi") && !process.stdout.isTTY) {
        process.stdout.write(terminalAnsi(rendered.terminal));
      }
      if (outDir) process.stderr.write(`Wrote ${join(outDir, `${outputName}.svg`)}\n`);
    } finally {
      rendered.dispose();
    }
  } else {
    loading.stop(source === "cached" ? "Rendered cached GitHub snapshot." : undefined);
  }

  if (!hasFlag("--no-ansi") && process.stdout.isTTY) {
    if (hasFlag("--interactive") && !hasFlag("--once")) {
      const component = makeCardComponent({
        ...snapshot,
        source,
        avatarMode: stdoutAvatarMode(snapshot),
      });
      mountInteractiveComponent(component);
    } else {
      const graphicsCapabilities = detectStdoutGraphicsCapabilities();
      const avatarMode =
        snapshot.avatarPngBase64 && graphicsCapabilities.supported ? "graphic" : "cells";
      const component = makeCardComponent({
        ...snapshot,
        source,
        avatarMode,
      });
      await printAnsiComponent(
        component,
        avatarMode === "graphic" ? graphicsCapabilities : undefined,
      );
    }
  }
}

function isDirectRun(): boolean {
  if (!process.argv[1]) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return realpathSync(process.argv[1]) === realpathSync(modulePath);
  } catch {
    return resolve(process.argv[1]) === modulePath;
  }
}

if (isDirectRun()) await main();
