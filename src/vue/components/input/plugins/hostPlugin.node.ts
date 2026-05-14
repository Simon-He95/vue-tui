import type { ResolveTInputPathInfo, TInputHostAdapter } from "../host.js";
import { Buffer } from "node:buffer";
import { createOsc52ClipboardProvider } from "../../../../runtime/index.js";
import { importNodeModule } from "../../../../utils/node-module.js";
import { pathToTerminalFileHref, resolveDefaultTInputPath } from "../host.js";
import { createTInputHostPlugin } from "./hostPlugin.js";

type SpawnLike = (
  cmd: string,
  args: string[],
  options?: Record<string, unknown>,
) => {
  stdout?: {
    setEncoding?: (encoding: string) => void;
    on?: (event: string, listener: (chunk: unknown) => void) => void;
  };
  on?: (event: string, listener: (...args: any[]) => void) => void;
  kill?: () => void;
};

export type CreateDefaultTInputHostAdapterOptions = Readonly<{
  clipboardCommandTimeoutMs?: number;
  clipboardTotalTimeoutMs?: number;
  /** Max bytes for OSC52 clipboard writes. */
  clipboardWriteMaxBytes?: number;
  /** @deprecated Use clipboardWriteMaxBytes. */
  clipboardMaxBytes?: number;
  clipboardReadMaxBytes?: number;
}>;

function getProcessLike(): any {
  return (globalThis as any).process;
}

function isTerminalLike(): boolean {
  const proc = getProcessLike();
  return Boolean(proc?.stdout?.isTTY) && typeof proc?.versions?.node === "string";
}

function getHomeDir(): string {
  const env = getProcessLike()?.env ?? {};
  return String(env.HOME || env.USERPROFILE || "");
}

function getPlatform(): string {
  return String(getProcessLike()?.platform || "");
}

async function loadNodeSpawn(): Promise<SpawnLike | null> {
  const override = (globalThis as any).__VT_NODE_SPAWN__;
  if (typeof override === "function") return override as SpawnLike;
  try {
    const mod = await importNodeModule<{ spawn?: SpawnLike }>("node:child_process");
    return typeof mod?.spawn === "function" ? (mod.spawn as SpawnLike) : null;
  } catch {
    return null;
  }
}

function normalizeClipboardPathList(raw: string): string {
  const text = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  if (!text) return "";
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

async function runClipboardCommand(
  cmd: string,
  args: string[],
  options: Readonly<{ timeoutMs?: number; maxBytes?: number }> = {},
): Promise<string | null> {
  const spawn = await loadNodeSpawn();
  if (!spawn) return null;

  const timeoutMs = Math.max(1, options.timeoutMs ?? 800);
  const maxBytes = Math.max(1, options.maxBytes ?? 1024 * 1024);

  return new Promise((resolve) => {
    let settled = false;
    let child: ReturnType<SpawnLike> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let out = "";
    let bytes = 0;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      if (timer != null) clearTimeout(timer);
      resolve(value);
    };

    timer = setTimeout(() => {
      try {
        child?.kill?.();
      } catch {}
      finish(null);
    }, timeoutMs);

    try {
      child = spawn(cmd, args, {
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      });
      child.stdout?.setEncoding?.("utf8");
      child.stdout?.on?.("data", (chunk) => {
        const text = String(chunk);
        bytes += Buffer.byteLength(text, "utf8");
        if (bytes > maxBytes) {
          try {
            child?.kill?.();
          } catch {}
          finish(null);
          return;
        }
        out += text;
      });
      child.on?.("error", () => finish(null));
      child.on?.("close", (code) => finish(code === 0 ? out : null));
    } catch {
      finish(null);
    }
  });
}

function positiveFiniteOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function remainingMs(deadline: number): number {
  return Math.max(1, deadline - Date.now());
}

async function readTerminalClipboardText(
  options: Readonly<{ commandTimeoutMs: number; totalTimeoutMs: number; maxReadBytes: number }>,
): Promise<string> {
  const platform = getPlatform();
  if (!platform) return "";

  const commandTimeoutMs = positiveFiniteOrDefault(options.commandTimeoutMs, 300);
  const totalTimeoutMs = positiveFiniteOrDefault(options.totalTimeoutMs, 800);
  const maxReadBytes = positiveFiniteOrDefault(options.maxReadBytes, 1024 * 1024);
  const deadline = Date.now() + totalTimeoutMs;
  const run = (cmd: string, args: string[]) =>
    Date.now() < deadline
      ? runClipboardCommand(cmd, args, {
          timeoutMs: Math.min(commandTimeoutMs, remainingMs(deadline)),
          maxBytes: maxReadBytes,
        })
      : Promise.resolve(null);

  try {
    if (platform === "darwin") {
      const filePaths = await run("osascript", [
        "-e",
        "set out to {}",
        "-e",
        "try",
        "-e",
        "set copiedItems to the clipboard as «class furl»",
        "-e",
        "if class of copiedItems is list then",
        "-e",
        "repeat with copiedItem in copiedItems",
        "-e",
        "set end of out to (copiedItem as text)",
        "-e",
        "end repeat",
        "-e",
        "else",
        "-e",
        "set end of out to (copiedItems as text)",
        "-e",
        "end if",
        "-e",
        "end try",
        "-e",
        "set AppleScript's text item delimiters to linefeed",
        "-e",
        "out as text",
      ]);
      const normalizedPaths = normalizeClipboardPathList(filePaths ?? "");
      if (normalizedPaths) return normalizedPaths;
      return (await run("pbpaste", [])) ?? "";
    }

    if (platform === "win32") {
      const clipboardScript = [
        "$files = Get-Clipboard -Format FileDropList -ErrorAction SilentlyContinue",
        "if ($files -and $files.Count -gt 0) { $files | ForEach-Object { $_ }; exit 0 }",
        "$text = Get-Clipboard -Raw",
        "if ($null -ne $text) { [Console]::Out.Write($text) }",
      ].join("; ");
      const powershellArgs = ["-NoProfile", "-Command", clipboardScript];
      let text = await run("powershell.exe", powershellArgs);
      if (text == null) text = await run("powershell", powershellArgs);
      if (text == null) text = await run("pwsh", powershellArgs);
      return text ?? "";
    }

    let text = await run("wl-paste", ["--no-newline"]);
    if (text == null) text = await run("xclip", ["-selection", "clipboard", "-o"]);
    if (text == null) text = await run("xsel", ["--clipboard", "--output"]);
    return text ?? "";
  } catch {
    return "";
  }
}

export function createDefaultTInputHostAdapter(
  options: CreateDefaultTInputHostAdapterOptions = {},
): TInputHostAdapter {
  return {
    isTerminalLike: isTerminalLike(),
    resolvePath(info: ResolveTInputPathInfo) {
      return resolveDefaultTInputPath({
        ...info,
        homeDir: getHomeDir() || info.homeDir,
      });
    },
    pathToHref: pathToTerminalFileHref,
    async readClipboardText() {
      if (!isTerminalLike()) return "";
      return readTerminalClipboardText({
        commandTimeoutMs: options.clipboardCommandTimeoutMs ?? 300,
        totalTimeoutMs: options.clipboardTotalTimeoutMs ?? 800,
        maxReadBytes: options.clipboardReadMaxBytes ?? 1024 * 1024,
      });
    },
    async writeClipboardText(text: string) {
      if (!text) return false;
      const clipboard = createOsc52ClipboardProvider({
        maxBytes: options.clipboardWriteMaxBytes ?? options.clipboardMaxBytes,
      });
      if (!clipboard.supported) return false;
      try {
        await clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const defaultTInputHostPlugin = createTInputHostPlugin(() =>
  createDefaultTInputHostAdapter(),
);
