import type { InjectionKey, Ref } from "vue";
import { injectionKey } from "../injection-key.js";
import type { RenderStack } from "./render-manager.js";

export const RenderStackKey: InjectionKey<Ref<RenderStack>> = injectionKey("RenderStack");
