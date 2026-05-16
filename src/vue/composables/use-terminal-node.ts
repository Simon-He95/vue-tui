import type { Ref } from "vue";
import type { WidthProvider } from "../../core/buffer/width.js";
import type { Rect, TerminalEventHandlerMap } from "../../events/manager/types.js";
import { computed, onBeforeUnmount, ref, watchEffect } from "vue";
import { useTerminal } from "./use-terminal.js";
import { withTextWidthProvider } from "../utils/text.js";

export interface TerminalNodeOptions {
  rect: Rect;
  zIndex?: number;
  visible?: boolean;
  focusable?: boolean;
  selectable?: boolean;
  selectionScrollBy?: (deltaRows: number) => boolean | void;
  handlers?: TerminalEventHandlerMap;
}

function wrapHandlers(
  handlers: TerminalEventHandlerMap | undefined,
  widthProvider: WidthProvider,
): TerminalEventHandlerMap {
  if (!handlers) return {};
  const out: TerminalEventHandlerMap = {};
  for (const key of Object.keys(handlers) as Array<keyof TerminalEventHandlerMap>) {
    const handler = handlers[key];
    if (!handler) continue;
    (out as any)[key] = (event: Parameters<typeof handler>[0]) =>
      withTextWidthProvider(widthProvider, () => (handler as any)(event));
  }
  return out;
}

export function useTerminalNode(getOptions: () => TerminalNodeOptions): {
  id: Ref<string | null>;
} {
  const { events, widthProvider } = useTerminal();
  const id = ref<string | null>(null);

  const options = computed(() => withTextWidthProvider(widthProvider, getOptions));

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
        handlers: wrapHandlers(opt.handlers, widthProvider),
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
      handlers: wrapHandlers(opt.handlers, widthProvider),
    });
  });

  onBeforeUnmount(() => {
    stop();
    const manager = events.value;
    if (manager && id.value) manager.unregister(id.value);
  });

  return { id };
}
