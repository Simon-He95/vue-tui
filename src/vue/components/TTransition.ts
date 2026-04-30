import type { PropType } from "vue";
import { defineComponent, onBeforeUnmount, provide, ref, watch } from "vue";
import { useTerminal } from "../composables/use-terminal.js";
import { VisibilityContextKey } from "../context.js";

type Phase = "idle" | "enter" | "leave";

type TransitionHook = (ctx: { phase: "enter" | "leave"; progress: number }) => void | Promise<void>;

export const TTransition = defineComponent({
  name: "TTransition",
  props: {
    show: { type: Boolean, required: true },
    duration: { type: Number, default: 200 },
    beforeEnter: {
      type: Function as PropType<TransitionHook>,
      default: undefined,
    },
    enter: { type: Function as PropType<TransitionHook>, default: undefined },
    afterEnter: {
      type: Function as PropType<TransitionHook>,
      default: undefined,
    },
    beforeLeave: {
      type: Function as PropType<TransitionHook>,
      default: undefined,
    },
    leave: { type: Function as PropType<TransitionHook>, default: undefined },
    afterLeave: {
      type: Function as PropType<TransitionHook>,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    const { scheduler } = useTerminal();

    let raf = 0;
    let runToken = 0;

    const phase = ref<Phase>("idle");
    const progress = ref(props.show ? 1 : 0);
    const rendered = ref(props.show);
    const visible = ref(props.show);
    provide(VisibilityContextKey, visible as any);

    function cancel(): void {
      if (raf > 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      runToken += 1;
    }

    async function runHook(
      hook: TransitionHook | undefined,
      phaseName: "enter" | "leave",
      p: number,
    ): Promise<void> {
      if (!hook) return;
      await hook({ phase: phaseName, progress: p });
    }

    function animate(from: number, to: number): Promise<void> {
      const duration = Math.max(0, Math.floor(props.duration));
      if (duration === 0) {
        progress.value = to;
        scheduler.invalidate();
        return Promise.resolve();
      }

      const token = runToken;
      const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

      return new Promise((resolve) => {
        const schedule = (fn: FrameRequestCallback): void => {
          raf = -1;
          const id = requestAnimationFrame(fn);
          if (raf === -1) raf = id;
        };

        const tick = () => {
          if (token !== runToken) {
            raf = 0;
            resolve();
            return;
          }
          const t = typeof performance !== "undefined" ? performance.now() : Date.now();
          const p = Math.min(1, (t - t0) / duration);
          progress.value = from + (to - from) * p;
          scheduler.invalidate();
          if (p >= 1) {
            raf = 0;
            resolve();
            return;
          }
          schedule(tick);
        };

        schedule(tick);
      });
    }

    async function enter(): Promise<void> {
      cancel();
      rendered.value = true;
      visible.value = true;
      phase.value = "enter";
      progress.value = 0;
      scheduler.invalidate();
      await runHook(props.beforeEnter, "enter", 0);
      await runHook(props.enter, "enter", 0);
      await animate(0, 1);
      progress.value = 1;
      phase.value = "idle";
      scheduler.invalidate();
      await runHook(props.afterEnter, "enter", 1);
    }

    async function leave(): Promise<void> {
      cancel();
      rendered.value = true;
      visible.value = true;
      phase.value = "leave";
      progress.value = 1;
      scheduler.invalidate();
      await runHook(props.beforeLeave, "leave", 1);
      await runHook(props.leave, "leave", 1);
      await animate(1, 0);
      progress.value = 0;
      phase.value = "idle";
      visible.value = false;
      rendered.value = false;
      scheduler.invalidate();
      await runHook(props.afterLeave, "leave", 0);
    }

    watch(
      () => props.show,
      (next, prev) => {
        if (next === prev) return;
        void (next ? enter() : leave());
      },
    );

    onBeforeUnmount(() => cancel());

    return () => {
      if (!rendered.value) return null;
      return slots.default?.({ phase: phase.value, progress: progress.value }) ?? null;
    };
  },
});
