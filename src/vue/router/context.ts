import type { InjectionKey, Ref } from "vue";
import { injectionKey } from "../injection-key.js";
import type { TerminalRoute, TerminalRouter } from "./types.js";

export const TerminalRouterKey: InjectionKey<TerminalRouter> = injectionKey("TerminalRouter");
export const TerminalRouteKey: InjectionKey<Ref<TerminalRoute>> = injectionKey("TerminalRoute");
