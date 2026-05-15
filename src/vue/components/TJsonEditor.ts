import type { PropType } from "vue";
import type { AnsiColorName, Style } from "../../core/types.js";
import type { TerminalKeyboardEvent } from "../../events/manager/types.js";
import { defineComponent, h, watch } from "vue";
import { TInput } from "./TInput.js";
import { TText } from "./TText.js";

export type JsonLintStatus = Readonly<{
  state: "idle" | "success" | "error";
  message?: string;
  line?: number;
  column?: number;
}>;

function indexToLineColumn(text: string, index: number): { line: number; column: number } {
  const capped = Math.max(0, Math.min(text.length, Math.floor(index)));
  let line = 1;
  let column = 1;
  for (let i = 0; i < capped; i += 1) {
    if (text[i] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function parseJsonErrorPosition(message: string): number | null {
  const m = /position\s+(\d+)/iu.exec(String(message ?? ""));
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

export function lintJsonText(input: string): JsonLintStatus {
  const text = String(input ?? "");
  if (!text.trim()) return { state: "idle" };
  try {
    JSON.parse(text);
    return { state: "success", message: "JSON syntax OK" };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const short = raw.replace(/\s*at position\s+\d.*$/iu, "").trim() || raw;
    const pos = parseJsonErrorPosition(raw);
    if (pos != null) {
      const { line, column } = indexToLineColumn(text, pos);
      return { state: "error", message: short, line, column };
    }
    return { state: "error", message: short };
  }
}

const DEFAULT_GUIDE_COLORS = [
  "cyanBright",
  "yellowBright",
  "greenBright",
  "magentaBright",
  "blueBright",
  "redBright",
] as const;

export function computeJsonIndentGuideDepths(input: string): number[] {
  const lines = String(input ?? "")
    .replace(/\r/g, "")
    .split("\n");
  const depths: number[] = [];
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (const line of lines) {
    const trimmed = line.trimStart();
    const startsWithCloser = trimmed.startsWith("}") || trimmed.startsWith("]");
    const visualDepth = startsWithCloser ? Math.max(0, depth - 1) : depth;
    depths.push(visualDepth);

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]!;
      if (inString) {
        if (escaping) {
          escaping = false;
          continue;
        }
        if (ch === "\\") {
          escaping = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{" || ch === "[") {
        depth += 1;
        continue;
      }
      if (ch === "}" || ch === "]") {
        depth = Math.max(0, depth - 1);
      }
    }
  }

  return depths;
}

export const TJsonEditor = defineComponent({
  name: "TJsonEditor",
  props: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    w: { type: Number, required: true },
    h: { type: Number, default: 8 },
    zIndex: { type: Number, default: 0 },
    modelValue: { type: String, required: true },
    placeholder: { type: String, default: "" },
    style: { type: Object as PropType<Style>, default: undefined },
    showIndentGuides: { type: Boolean, default: true },
    indentSize: { type: Number, default: 2 },
    guideColors: {
      type: Array as PropType<readonly AnsiColorName[]>,
      default: () => [...DEFAULT_GUIDE_COLORS],
    },
    autoFocus: { type: Boolean, default: false },
    cursorToEndOnFirstFocus: { type: Boolean, default: true },
    cursorToEndOnExternalUpdate: { type: Boolean, default: true },
    submitOnEnter: { type: Boolean, default: false },
  },
  emits: [
    "update:modelValue",
    "keydown",
    "focus",
    "blur",
    "undo",
    "redo",
    "lintChange",
    "validationError",
  ],
  setup(props, { emit }) {
    let cachedLintText: string | null = null;
    let cachedLintStatus: JsonLintStatus = { state: "idle" };
    let lastPublishedLintText: string | null = null;

    function normalizeText(value: string): string {
      return String(value ?? "").replace(/\r/g, "");
    }

    function getLintStatus(value: string): JsonLintStatus {
      const normalized = normalizeText(value);
      if (cachedLintText === normalized) return cachedLintStatus;
      cachedLintText = normalized;
      cachedLintStatus = lintJsonText(normalized);
      return cachedLintStatus;
    }

    function publishLint(value: string): void {
      const normalized = normalizeText(value);
      if (lastPublishedLintText === normalized) return;
      lastPublishedLintText = normalized;
      emit("lintChange", getLintStatus(normalized));
    }

    watch(
      () => props.modelValue,
      (value) => {
        publishLint(value);
      },
      { immediate: true },
    );

    return () => {
      const text = normalizeText(props.modelValue);
      const lines = text.split("\n");
      const lint = getLintStatus(text);
      const indentSize = Math.max(1, Math.floor(props.indentSize ?? 2));
      const contentW = Math.max(0, Math.floor(props.w) - 2);
      const visibleLines = Math.max(0, Math.floor(props.h));
      const colors = props.guideColors?.length ? props.guideColors : DEFAULT_GUIDE_COLORS;

      const guideNodes: any[] = [];
      if (props.showIndentGuides && contentW > 0 && visibleLines > 0) {
        const depths = computeJsonIndentGuideDepths(text);
        const lineCount = Math.min(visibleLines, lines.length, depths.length);

        for (let row = 0; row < lineCount; row += 1) {
          const line = lines[row] ?? "";
          const leadingSpaces = line.match(/^ +/u)?.[0]?.length ?? 0;
          const depth = depths[row] ?? 0;
          const guides = Math.min(depth, Math.floor(leadingSpaces / indentSize));
          const maxGuidesByWidth = Math.floor(contentW / indentSize);
          const guideCount = Math.min(guides, maxGuidesByWidth);
          for (let i = 0; i < guideCount; i += 1) {
            const x = props.x + 1 + i * indentSize;
            const y = props.y + row;
            const color = colors[i % colors.length] ?? "cyanBright";
            guideNodes.push(
              h(TText, {
                key: `guide-${row}-${i}`,
                x,
                y,
                w: 1,
                h: 1,
                zIndex: (props.zIndex ?? 0) + 1,
                value: "│",
                clear: false,
                style: { fg: color, dim: true },
              }),
            );
          }
        }
      }

      const markerNodes: any[] = [];
      if (
        lint.state === "error" &&
        typeof lint.line === "number" &&
        typeof lint.column === "number"
      ) {
        const row = lint.line - 1;
        const col = lint.column - 1;
        if (row >= 0 && row < visibleLines && col >= 0 && col < contentW) {
          const line = lines[row] ?? "";
          const ch = line[col] ?? " ";
          markerNodes.push(
            h(TText, {
              key: `marker-${row}-${col}`,
              x: props.x + 1 + col,
              y: props.y + row,
              w: 1,
              h: 1,
              zIndex: (props.zIndex ?? 0) + 2,
              value: ch,
              clear: false,
              style: { fg: "redBright", bold: true, underline: true },
            }),
          );
        }
      }

      const inputNode = h(TInput, {
        x: props.x,
        y: props.y,
        w: props.w,
        h: props.h,
        zIndex: props.zIndex,
        modelValue: props.modelValue,
        "onUpdate:modelValue": (v: string) => {
          emit("update:modelValue", v);
          publishLint(v);
        },
        placeholder: props.placeholder,
        style: props.style,
        autoFocus: props.autoFocus,
        cursorToEndOnFirstFocus: props.cursorToEndOnFirstFocus,
        cursorToEndOnExternalUpdate: props.cursorToEndOnExternalUpdate,
        submitOnEnter: props.submitOnEnter,
        onKeydown: (e: TerminalKeyboardEvent) => {
          emit("keydown", e);
          if (e?.defaultPrevented) return;
          const isShortcut = Boolean((e.metaKey || e.ctrlKey) && !e.altKey);
          if (!isShortcut) return;
          if (e.key === "z" || e.key === "Z") {
            e.preventDefault?.();
            e.stopPropagation?.();
            if (e.shiftKey) emit("redo");
            else emit("undo");
            return;
          }
          if (e.key === "y" || e.key === "Y") {
            e.preventDefault?.();
            e.stopPropagation?.();
            emit("redo");
          }
        },
        onFocus: () => emit("focus"),
        onBlur: () => emit("blur"),
        onValidationError: (info: unknown) => emit("validationError", info),
      });

      return h("div", null, [inputNode, ...guideNodes, ...markerNodes]);
    };
  },
});
