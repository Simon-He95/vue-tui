import type { ComputedRef } from "vue";
import type { TerminalRoute, TerminalRouter } from "./types.js";
import { computed, inject } from "vue";
import { TerminalRouteKey, TerminalRouterKey } from "./context.js";

export function useRouter(): TerminalRouter {
  const r = inject(TerminalRouterKey, null);
  if (!r) throw new Error("TerminalRouter is missing");
  return r;
}

export function useRoute(): ComputedRef<TerminalRoute> {
  const route = inject(TerminalRouteKey, null);
  if (!route) throw new Error("TerminalRoute is missing");
  return computed(() => route.value);
}
