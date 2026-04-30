/**
 * Debug logger that writes to a file instead of stderr.
 * This allows debugging terminal rendering issues without polluting the terminal output.
 */

import { appendFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const LOG_FILE = "/tmp/goatchain-debug.log";
let enabled = false;

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
      writeFileSync(
        LOG_FILE,
        `=== GoatChain Debug Log Started at ${new Date().toISOString()} ===\n\n`,
      );
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
    // Use appendFileSync to avoid async blocking from WriteStream
    // This ensures debug logging doesn't interfere with the event loop
    appendFileSync(LOG_FILE, data);
  } catch {
    // If we can't write to the file, just give up silently
  }
}

/**
 * Check if debug logging is enabled via environment variable
 */
export function isDebugEnabled(): boolean {
  const env = process?.env;
  return env?.DIMCODE_DEBUG === "1" || env?.DEBUG === "1";
}
