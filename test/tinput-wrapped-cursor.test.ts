import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { createTerminalApp } from "../src/cli.js";
import { TInput } from "../src/vue.js";
import { indexToWrappedCellColFirstWidthInline } from "../src/vue/components/input/utils/inlineTextTokens.js";

describe("TInput wrapped cursor", () => {
  it.each(["abcdefghi", "你好世界啊"])(
    "keeps the caret visible when moving up to a soft wrap in %s",
    async (firstLine) => {
      const value = ref(`${firstLine}\nz`);
      const width = ref(10);
      const app = createTerminalApp({
        cols: 24,
        rows: 6,
        component: defineComponent({
          setup: () => () =>
            h(TInput, {
              x: 0,
              y: 0,
              w: width.value,
              h: 4,
              modelValue: value.value,
              "onUpdate:modelValue": (text: string) => (value.value = text),
              autoFocus: true,
              cursorToEndOnFirstFocus: true,
              cursorBlink: false,
            }),
        }),
      });

      try {
        app.mount();
        await nextTick();
        app.scheduler.flushNow();

        const key = async (key: string) => {
          app.events.dispatch({ type: "keydown", key });
          await nextTick();
          app.scheduler.flushNow();
        };

        await key("Home");
        expect(app.terminal.getCell(1, 2).style.inverse).toBe(true);
        await key("ArrowUp");
        expect(app.terminal.getCell(1, 1).style.inverse).toBe(true);
        await key("ArrowDown");
        expect(app.terminal.getCell(1, 2).style.inverse).toBe(true);
        await key("ArrowUp");

        width.value = 20;
        await nextTick();
        app.scheduler.flushNow();
        expect(app.terminal.getCell(9, 0).style.inverse).toBe(true);

        await key("X");
        const index = firstLine === "abcdefghi" ? 8 : 4;
        expect(value.value).toBe(`${firstLine.slice(0, index)}X${firstLine.slice(index)}\nz`);
      } finally {
        app.dispose();
      }
    },
  );

  it.each([
    { value: "abcdefghi", index: 8, firstWidth: 8, width: 8, line: 1, col: 0 },
    { value: "abcdefgh", index: 8, firstWidth: 8, width: 8, line: 1, col: 0 },
    { value: "abc你", index: 3, firstWidth: 4, width: 4, line: 1, col: 0 },
    { value: "abcdef", index: 3, firstWidth: 3, width: 8, line: 1, col: 0 },
    { value: "abc\ndef", index: 3, firstWidth: 8, width: 8, line: 0, col: 3 },
    { value: "abc\ndef", index: 4, firstWidth: 8, width: 8, line: 1, col: 0 },
  ])("maps $value index $index to row $line column $col", (test) => {
    const pos = indexToWrappedCellColFirstWidthInline(
      test.value,
      undefined,
      undefined,
      test.index,
      test.firstWidth,
      test.width,
    );
    expect({ line: pos.line, col: pos.col }).toEqual({ line: test.line, col: test.col });
  });
});
