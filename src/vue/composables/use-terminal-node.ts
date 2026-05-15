import type { Ref } from "vue";
import type { Rect, TerminalEventHandlerMap } from "../../events/manager/types.js";
import { computed, onBeforeUnmount, ref, watchEffect } from "vue";
import { useTerminal } from "./use-terminal.js";

export interface TerminalNodeOptions {
  rect: Rect;
  zIndex?: number;
  visible?: boolean;
  focusable?: boolean;
  selectable?: boolean;
  selectionScrollBy?: (deltaRows: number) => boolean | void;
  handlers?: TerminalEventHandlerMap;
}

export function useTerminalNode(getOptions: () => TerminalNodeOptions): {
  id: Ref<string | null>;
} {
  const { events } = useTerminal();
  const id = ref<string | null>(null);

  const options = computed(() => getOptions());

  const stop = watchEffect(() => {
    const manager = events.value;
    if (!manager) return;
    const opt = options.value;
    if (!id.value) {
      const node = manager.register({
        rect: opt.rect,
        zIndex: opt.zIndex ?? 0,
        visible: opt.visible,
        focusable: opt.focusable,
        selectable: opt.selectable,
        selectionScrollBy: opt.selectionScrollBy,
        handlers: opt.handlers ?? {},
      });
      id.value = node.id;
      return;
    }
    manager.update(id.value, {
      rect: opt.rect,
      zIndex: opt.zIndex ?? 0,
      visible: opt.visible,
      focusable: opt.focusable,
      selectable: opt.selectable,
      selectionScrollBy: opt.selectionScrollBy,
      handlers: opt.handlers ?? {},
    });
  });

  onBeforeUnmount(() => {
    stop();
    const manager = events.value;
    if (manager && id.value) manager.unregister(id.value);
  });

  return { id };
}
