import type { ResolveTInputPathInfo, TInputHostAdapter } from "../host.js";
import type { TInputPlugin } from "./types.js";
import { createOsc52ClipboardProvider } from "../../../../runtime/index.js";
import { pathToTerminalFileHref, resolveDefaultTInputPath } from "../host.js";

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
};

const importNodeModule = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<any>;

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
    const mod = await importNodeModule("node:child_process");
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

async function runClipboardCommand(cmd: string, args: string[]): Promise<string | null> {
  const spawn = await loadNodeSpawn();
  if (!spawn) return null;

  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, {
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      });
      let out = "";
      child.stdout?.setEncoding?.("utf8");
      child.stdout?.on?.("data", (chunk) => {
        out += String(chunk);
      });
      child.on?.("error", () => resolve(null));
      child.on?.("close", (code) => resolve(code === 0 ? out : null));
    } catch {
      resolve(null);
    }
  });
}

async function readTerminalClipboardText(): Promise<string> {
  const platform = getPlatform();
  if (!platform) return "";

  try {
    if (platform === "darwin") {
      const filePaths = await runClipboardCommand("osascript", [
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
      return (await runClipboardCommand("pbpaste", [])) ?? "";
    }

    if (platform === "win32") {
      const clipboardScript = [
        "$files = Get-Clipboard -Format FileDropList -ErrorAction SilentlyContinue",
        "if ($files -and $files.Count -gt 0) { $files | ForEach-Object { $_ }; exit 0 }",
        "$text = Get-Clipboard -Raw",
        "if ($null -ne $text) { [Console]::Out.Write($text) }",
      ].join("; ");
      const powershellArgs = ["-NoProfile", "-Command", clipboardScript];
      let text = await runClipboardCommand("powershell.exe", powershellArgs);
      if (text == null) text = await runClipboardCommand("powershell", powershellArgs);
      if (text == null) text = await runClipboardCommand("pwsh", powershellArgs);
      return text ?? "";
    }

    let text = await runClipboardCommand("wl-paste", ["--no-newline"]);
    if (text == null) {
      text = await runClipboardCommand("xclip", ["-selection", "clipboard", "-o"]);
    }
    if (text == null) text = await runClipboardCommand("xsel", ["--clipboard", "--output"]);
    return text ?? "";
  } catch {
    return "";
  }
}

export function createTInputHostPlugin(
  adapterOrFactory: TInputHostAdapter | (() => TInputHostAdapter),
): TInputPlugin {
  return {
    name: "tinput-host",
    install(ctx) {
      const adapter =
        typeof adapterOrFactory === "function" ? adapterOrFactory() : adapterOrFactory;
      ctx.registerHostAdapter(adapter);
    },
  };
}

export function createDefaultTInputHostAdapter(): TInputHostAdapter {
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
      return readTerminalClipboardText();
    },
    async writeClipboardText(text: string) {
      if (!text) return false;
      const clipboard = createOsc52ClipboardProvider();
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
