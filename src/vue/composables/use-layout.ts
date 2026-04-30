import type { LayoutContext } from "../context.js";
import { inject } from "vue";
import { LayoutContextKey } from "../context.js";

export function useLayout(): LayoutContext {
  const ctx = inject(LayoutContextKey, null);
  if (!ctx) throw new Error("LayoutContext is missing (TerminalProvider/TView)");
  return ctx;
}
