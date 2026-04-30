import type { InjectionKey, Ref } from "vue";
import type { TerminalRoute, TerminalRouter } from "./types.js";

export const TerminalRouterKey: InjectionKey<TerminalRouter> = Symbol("TerminalRouter") as any;
export const TerminalRouteKey: InjectionKey<Ref<TerminalRoute>> = Symbol("TerminalRoute") as any;
