import type { TerminalContext } from "../context.js";
import { inject } from "vue";
import { TerminalContextKey } from "../context.js";

export function useTerminal(): TerminalContext {
  const ctx = inject(TerminalContextKey, null);
  if (!ctx) throw new Error("TerminalProvider is missing");
  return ctx;
}
