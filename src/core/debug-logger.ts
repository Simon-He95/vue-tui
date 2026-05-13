/**
 * Debug logger that writes to a file instead of stderr.
 * This allows debugging terminal rendering issues without polluting the terminal output.
 */

const LOG_FILE = "/tmp/goatchain-debug.log";
let enabled = false;

type FsLike = Readonly<{
  appendFileSync?: (path: string, data: string) => void;
  writeFileSync?: (path: string, data: string) => void;
}>;

const importNodeModule = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<any>;

let fsPromise: Promise<FsLike | null> | null = null;

function getFsSync(): FsLike | null {
  const req = (globalThis as any).require;
  if (typeof req !== "function") return null;
  try {
    return req("node:fs") ?? req("fs") ?? null;
  } catch {
    return null;
  }
}

function getFsAsync(): Promise<FsLike | null> {
  fsPromise ??= importNodeModule("node:fs").catch(() => null);
  return fsPromise;
}

export interface DebugLogger {
  render: (message: string) => void;
  stream: (message: string) => void;
  error: (message: string, ...args: any[]) => void;
}

/**
 * Initialize the debug logger.
 * @param enable Whether to enable debug logging
 * @returns DebugLogger instance
 */
export function createDebugLogger(enable = false): DebugLogger {
  enabled = enable;

  if (enabled) {
    // Clear the log file on start
    try {
      const data = `=== GoatChain Debug Log Started at ${new Date().toISOString()} ===\n\n`;
      const fs = getFsSync();
      if (fs?.writeFileSync) fs.writeFileSync(LOG_FILE, data);
      else void getFsAsync().then((mod) => mod?.writeFileSync?.(LOG_FILE, data));
    } catch {
      // Ignore errors
    }
  }

  return {
    render: (message: string) => log("[RENDER]", message),
    stream: (message: string) => log("[STREAM]", message),
    error: (message: string, ...args: any[]) => {
      if (!enabled) return;
      const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
      const fullMessage = `[${timestamp}] [ERROR] ${message}${
        args.length ? ` ${JSON.stringify(args)}` : ""
      }`;
      write(`${fullMessage}\n`);
    },
  };
}

function log(category: string, message: string): void {
  if (!enabled) return;
  const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
  write(`[${timestamp}] ${category} ${message}\n`);
}

function write(data: string): void {
  if (!enabled) return;
  try {
    const fs = getFsSync();
    if (fs?.appendFileSync) fs.appendFileSync(LOG_FILE, data);
    else void getFsAsync().then((mod) => mod?.appendFileSync?.(LOG_FILE, data));
  } catch {
    // If we can't write to the file, just give up silently
  }
}

/**
 * Check if debug logging is enabled via environment variable
 */
export function isDebugEnabled(): boolean {
  const env = (globalThis as any).process?.env;
  return env?.DIMCODE_DEBUG === "1" || env?.DEBUG === "1";
}
