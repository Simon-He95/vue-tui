import process from "node:process";
import { hasFlag } from "./args.js";
import type { LoadingStatus } from "./types.js";

export function createLoadingStatus(): LoadingStatus {
  if (!process.stderr.isTTY || hasFlag("--no-loading")) {
    return { set: () => {}, stop: () => {} };
  }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frame = 0;
  let message = "Loading";
  let stopped = false;
  const paint = () => {
    if (stopped) return;
    process.stderr.write(`\r\u001B[2K${frames[frame++ % frames.length]} ${message}`);
  };
  const timer = setInterval(paint, 120);
  paint();
  return {
    set(nextMessage: string) {
      message = nextMessage;
      paint();
    },
    stop(finalMessage?: string) {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      process.stderr.write(`\r\u001B[2K${finalMessage ? `${finalMessage}\n` : ""}`);
    },
  };
}
