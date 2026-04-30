import type { ComputedRef, VNode } from "vue";
import { computed, inject, provide, ref, vShow } from "vue";
import { VisibilityContextKey } from "../context.js";
import { useTerminal } from "./use-terminal.js";

type ShowCallback = (value: boolean) => void;

const VUE_TERMINAL_SHOW_CB = "__vueTerminalOnShow";

let vShowPatched = false;

function patchVShow(): void {
  if (vShowPatched) return;
  vShowPatched = true;

  const dir: any = vShow as any;
  const origBeforeMount = dir.beforeMount;
  const origUpdated = dir.updated;
  const origBeforeUnmount = dir.beforeUnmount;

  const notify = (el: unknown, value: unknown) => {
    if (!el || typeof el !== "object") return;
    const cb = (el as any)[VUE_TERMINAL_SHOW_CB] as ShowCallback | undefined;
    cb?.(Boolean(value));
  };

  if (typeof origBeforeMount === "function") {
    dir.beforeMount = (el: unknown, binding: any, vnode: any) => {
      origBeforeMount(el as any, binding, vnode);
      notify(el, binding?.value);
    };
  }

  if (typeof origUpdated === "function") {
    dir.updated = (el: unknown, binding: any, vnode: any) => {
      origUpdated(el as any, binding, vnode);
      notify(el, binding?.value);
    };
  }

  if (typeof origBeforeUnmount === "function") {
    dir.beforeUnmount = (el: unknown, binding: any, vnode: any) => {
      origBeforeUnmount(el as any, binding, vnode);
      notify(el, binding?.value);
    };
  }
}

const PLACEHOLDER_STYLE: Readonly<Record<string, string | number>> = Object.freeze({
  position: "absolute",
  left: "-9999px",
  top: "0",
  width: "0",
  height: "0",
  overflow: "hidden",
});

export type VisibilityRootProps = Readonly<{
  style: Readonly<Record<string, string | number>>;
  onVnodeBeforeMount: (vnode: VNode) => void;
  onVnodeBeforeUnmount: (vnode: VNode) => void;
}>;

export function useVisibility(options?: { provide?: boolean }): Readonly<{
  visible: ComputedRef<boolean>;
  rootProps: VisibilityRootProps;
}> {
  patchVShow();
  const { scheduler } = useTerminal();

  const parentVisible = inject(VisibilityContextKey, ref(true));
  const localVisible = ref(true);
  const visible = computed(() => parentVisible.value && localVisible.value);

  if (options?.provide) provide(VisibilityContextKey, visible as any);

  const onShow: ShowCallback = (value) => {
    localVisible.value = value;
    scheduler.invalidate();
  };

  const rootProps: VisibilityRootProps = {
    style: PLACEHOLDER_STYLE,
    onVnodeBeforeMount: (vnode) => {
      const el = vnode.el as any;
      if (el && typeof el === "object") el[VUE_TERMINAL_SHOW_CB] = onShow;
    },
    onVnodeBeforeUnmount: (vnode) => {
      const el = vnode.el as any;
      if (el && typeof el === "object" && el[VUE_TERMINAL_SHOW_CB] === onShow)
        delete el[VUE_TERMINAL_SHOW_CB];
    },
  };

  return { visible, rootProps };
}
