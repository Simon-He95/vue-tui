import type { PropType } from "vue";
import type { Style } from "../../core/types.js";
import type { TerminalKeyboardEvent, TerminalPointerEvent } from "../../events/manager/types.js";
import { computed, defineComponent, h } from "vue";
import { useTerminal } from "../composables/use-terminal.js";
import { TText } from "./TText.js";
import { TView } from "./TView.js";
import { fitCellText, mergeStyle } from "./simple-utils.js";

export type TTreeNode = Readonly<{
  id: string;
  label: string;
  children?: readonly TTreeNode[];
  disabled?: boolean;
  data?: unknown;
}>;

export type TTreeSelectPayload = Readonly<{
  node: TTreeNode;
  id: string;
}>;

export type TTreeTogglePayload = Readonly<{
  node: TTreeNode;
  id: string;
  expanded: boolean;
}>;

type FlatTreeNode = Readonly<{
  node: TTreeNode;
  depth: number;
  expandable: boolean;
  expanded: boolean;
}>;

function flattenTree(
  nodes: readonly TTreeNode[],
  expanded: Set<string>,
  depth = 0,
  out: FlatTreeNode[] = [],
): FlatTreeNode[] {
  for (const node of nodes) {
    const expandable = Boolean(node.children?.length);
    const isExpanded = expanded.has(node.id);
    out.push({ node, depth, expandable, expanded: isExpanded });
    if (expandable && isExpanded) flattenTree(node.children!, expanded, depth + 1, out);
  }
  return out;
}

export const TTree = defineComponent({
  name: "TTree",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, required: true },
    zIndex: { type: Number, default: 0 },
    nodes: {
      type: Array as PropType<readonly TTreeNode[]>,
      required: true,
    },
    expandedIds: {
      type: Array as PropType<readonly string[]>,
      default: () => [],
    },
    selectedId: { type: String, default: "" },
    style: { type: Object as PropType<Style>, default: undefined },
    selectedStyle: { type: Object as PropType<Style>, default: () => ({ inverse: true }) },
    disabledStyle: { type: Object as PropType<Style>, default: () => ({ dim: true }) },
    indent: { type: Number, default: 2 },
    selectableParents: { type: Boolean, default: false },
  },
  emits: {
    "update:expandedIds": (_ids: string[]) => true,
    "update:selectedId": (_id: string) => true,
    select: (_payload: TTreeSelectPayload) => true,
    toggle: (_payload: TTreeTogglePayload) => true,
  },
  setup(props, { emit }) {
    const { defaultStyle } = useTerminal();
    const baseStyle = computed(() => mergeStyle(defaultStyle.value, props.style));
    const expandedSet = computed(() => new Set(props.expandedIds));
    const rows = computed(() => flattenTree(props.nodes, expandedSet.value).slice(0, props.h));

    function toggle(item: FlatTreeNode): void {
      if (item.node.disabled || !item.expandable) return;
      const ids = new Set(props.expandedIds);
      if (ids.has(item.node.id)) ids.delete(item.node.id);
      else ids.add(item.node.id);
      const next = Array.from(ids);
      emit("update:expandedIds", next);
      emit("toggle", { node: item.node, id: item.node.id, expanded: ids.has(item.node.id) });
    }

    function select(item: FlatTreeNode): void {
      if (item.node.disabled) return;
      emit("update:selectedId", item.node.id);
      emit("select", { node: item.node, id: item.node.id });
    }

    function markerX(item: FlatTreeNode): number {
      return Math.max(0, Math.floor(props.indent)) * item.depth;
    }

    function handleClick(item: FlatTreeNode, event: TerminalPointerEvent): void {
      if (!item.expandable) {
        select(item);
        return;
      }
      if (!props.selectableParents) {
        toggle(item);
        return;
      }

      const rowX = event.currentTarget?.rect.x ?? 0;
      const localX = event.cellX - rowX;
      if (localX <= markerX(item) + 1) toggle(item);
      else select(item);
    }

    function handleKeydown(item: FlatTreeNode, event: TerminalKeyboardEvent): void {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault?.();
      if (!item.expandable) {
        select(item);
        return;
      }
      if (!props.selectableParents || event.key === " ") toggle(item);
      else select(item);
    }

    return () =>
      h(
        TView as any,
        { x: props.x, y: props.y, w: props.w, h: props.h, zIndex: props.zIndex },
        () =>
          rows.value.map((item, index) => {
            const marker = item.expandable ? (item.expanded ? "v" : ">") : " ";
            const indent = " ".repeat(Math.max(0, Math.floor(props.indent)) * item.depth);
            const text = fitCellText(`${indent}${marker} ${item.node.label}`, props.w);
            const selected = item.node.id === props.selectedId;
            const style = item.node.disabled
              ? mergeStyle(baseStyle.value, props.disabledStyle)
              : selected
                ? mergeStyle(baseStyle.value, props.selectedStyle)
                : baseStyle.value;
            return h(
              TView as any,
              {
                key: item.node.id,
                x: 0,
                y: index,
                w: props.w,
                h: 1,
                focusable: !item.node.disabled,
                onClick: (event: TerminalPointerEvent) => handleClick(item, event),
                onKeydown: (event: TerminalKeyboardEvent) => handleKeydown(item, event),
              },
              () => h(TText as any, { x: 0, y: 0, w: props.w, value: text, style }),
            );
          }),
      );
  },
});
