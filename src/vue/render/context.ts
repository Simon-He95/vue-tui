import type { InjectionKey, Ref } from "vue";
import type { RenderStack } from "./render-manager.js";

export const RenderStackKey: InjectionKey<Ref<RenderStack>> = Symbol("RenderStack") as any;
