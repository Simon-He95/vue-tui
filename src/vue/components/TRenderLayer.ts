import type { PropType } from "vue";
import { computed, defineComponent, provide } from "vue";
import { useRenderStack } from "../composables/use-render-stack.js";
import { useTerminal } from "../composables/use-terminal.js";
import { RenderStackKey } from "../render/context.js";

export const TRenderLayer = defineComponent({
  name: "TRenderLayer",
  props: {
    zIndex: { type: Number as PropType<number>, default: 0 },
  },
  setup(props, { slots }) {
    const { render } = useTerminal();
    const parentStack = useRenderStack();

    const stack = computed(() => render.createStack(parentStack.value, props.zIndex));

    provide(RenderStackKey, stack as any);

    return () => slots.default?.() ?? null;
  },
});
