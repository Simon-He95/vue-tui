import type { Ref } from "vue";
import type { RenderStack } from "../render/render-manager.js";
import { inject } from "vue";
import { RenderStackKey } from "../render/context.js";

export function useRenderStack(): Ref<RenderStack> {
  const stack = inject(RenderStackKey, null);
  if (!stack) throw new Error("RenderStack is missing");
  return stack;
}
