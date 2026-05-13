import type { createTerminalApp } from "../../src/cli.js";

type TerminalLike = ReturnType<typeof createTerminalApp>["terminal"];

export function rowText(mounted: { terminal: TerminalLike }, y: number): string {
  return mounted.terminal
    .getRow(y)
    .map((cell) => cell.ch)
    .join("")
    .trimEnd();
}
