import type { InjectionKey, Ref } from "vue";
import type { TerminalRoute, TerminalRouter } from "./types.js";

export const TerminalRouterKey: InjectionKey<TerminalRouter> = Symbol.for(
  "@simon_he/vue-tui:TerminalRouter",
) as any;
export const TerminalRouteKey: InjectionKey<Ref<TerminalRoute>> = Symbol.for(
  "@simon_he/vue-tui:TerminalRoute",
) as any;
