import type { PropType } from "vue";
import { defineComponent, h, onBeforeUnmount, ref } from "vue";
import { TInputBox, useTerminal } from "../../src/vue.js";

/**
 * Height of the pinned REPL bar (TInputBox border box) in rows.
 * The TUI terminal buffer is exactly this tall — it owns nothing else.
 */
export const CHAT_CLI_BAR_ROWS = 3;

/**
 * Rows of blank space kept between the native output region and the pinned
 * input bar, so the bar never sits flush against the content above it.
 */
export const CHAT_CLI_BAR_GAP = 2;

export type ChatCliHandlers = Readonly<{
  /** Called when the user submits a message (Enter in the bar). */
  onSubmit?: (text: string) => void;
}>;

/**
 * The only TUI-owned region in REPL mode: a border-boxed input pinned to the
 * bottom of the screen by the stdout renderer (`anchor: "bottom"`). Everything
 * above is native terminal output owned by the caller.
 */
export function createChatCliApp(handlers: ChatCliHandlers = {}) {
  return {
    handlers,
    component: defineComponent({
      name: "ChatCliBar",
      setup() {
        const { terminal, scheduler } = useTerminal();
        const size = ref(terminal.size());
        const offResize = terminal.on("resize", () => {
          size.value = terminal.size();
          scheduler.invalidate();
        });
        onBeforeUnmount(offResize);

        const input = ref("");

        return () =>
          h(TInputBox, {
            x: 0,
            y: 0,
            w: size.value.cols,
            h: size.value.rows,
            title: "chat · Enter 发送 · Ctrl+C 退出",
            modelValue: input.value,
            "onUpdate:modelValue": (v: string) => {
              input.value = v;
            },
            onChange: (v: string) => {
              const trimmed = String(v ?? "").trim();
              if (!trimmed) return;
              input.value = "";
              handlers.onSubmit?.(trimmed);
            },
            autoFocus: true,
          });
      },
    }),
  };
}
