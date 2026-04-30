import type { PropType } from "vue";
import type { TerminalRouteRecord } from "./types.js";
import { computed, defineComponent, h, inject, ref, watch } from "vue";
import { TerminalRouterKey } from "./context.js";
import { resolveTerminalRouteComponent } from "./router.js";

export const TRouterView = defineComponent({
  name: "TRouterView",
  props: {
    routes: { type: Array as PropType<TerminalRouteRecord[]>, required: true },
    forceRemount: { type: Boolean, default: true },
  },
  setup(props) {
    const router = inject(TerminalRouterKey, null);
    if (!router) {
      throw new Error("TerminalRouter is missing (did you forget to app.use(router)?)");
    }

    const key = ref(0);
    watch(
      () => router.currentRoute.value,
      () => {
        if (props.forceRemount) key.value++;
      },
      { deep: true },
    );

    const component = computed(() => resolveTerminalRouteComponent(router, props.routes));

    return () => {
      const C = component.value;
      return C ? h(C as any, { key: props.forceRemount ? key.value : undefined }) : null;
    };
  },
});
