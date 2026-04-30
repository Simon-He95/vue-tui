import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { createTerminalApp, TInput } from "../src/index.js";

describe("TInput emoji deletion", () => {
  const complexEmojis = [
    "👨‍💻", // ZWJ sequence
    "👩🏽‍🚒", // skin tone + ZWJ
    "🇺🇸", // regional indicator flag
    "🏳️‍🌈", // flag with VS16 + ZWJ
    "🧑🏾‍🤝‍🧑🏻", // multi-person with skin tones + ZWJ
    "1️⃣", // keycap
    "👨‍👩‍👧‍👦", // family (multiple ZWJ)
    "👩‍❤️‍💋‍👨", // kiss sequence
    "🏴‍☠️", // pirate flag (ZWJ + VS16)
    "🏳️‍⚧️", // trans flag (ZWJ + VS16)
    "🇯🇵", // regional indicator flag (another)
    "☕️", // VS16 emoji presentation
    "✍️", // VS16 + skin tone compatible glyph
    "🫱🏽‍🫲🏻", // handshake with skin tones (ZWJ)
  ];

  it("ArrowLeft moves over an emoji as a single grapheme", async () => {
    const value = ref("👀");
    const App = defineComponent({
      name: "EmojiArrowLeftApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 10,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
            cursorToEndOnFirstFocus: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 3, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({
      type: "keydown",
      key: "ArrowLeft",
      code: "ArrowLeft",
    } as any);
    app.events.dispatch({ type: "keydown", key: "a", code: "KeyA" } as any);
    app.scheduler.flush();

    expect(value.value).toBe("a👀");
    app.dispose();
  });

  it("ArrowRight moves over an emoji as a single grapheme", async () => {
    const value = ref("👀");
    const App = defineComponent({
      name: "EmojiArrowRightApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 10,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 3, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({ type: "keydown", key: "Home", code: "Home" } as any);
    app.events.dispatch({
      type: "keydown",
      key: "ArrowRight",
      code: "ArrowRight",
    } as any);
    app.events.dispatch({ type: "keydown", key: "a", code: "KeyA" } as any);
    app.scheduler.flush();

    expect(value.value).toBe("👀a");
    app.dispose();
  });

  it("Arrow keys move across complex emoji sequences as single graphemes", async () => {
    const value = ref(`a${complexEmojis.join("")}b`);
    const App = defineComponent({
      name: "ComplexEmojiArrowApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 40,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
          });
      },
    });

    const app = createTerminalApp({ cols: 60, rows: 3, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    // Move to start, then step through each grapheme.
    app.events.dispatch({ type: "keydown", key: "Home", code: "Home" } as any);
    app.scheduler.flush();
    for (let i = 0; i < 1 + complexEmojis.length; i++) {
      app.events.dispatch({
        type: "keydown",
        key: "ArrowRight",
        code: "ArrowRight",
      } as any);
    }
    app.events.dispatch({ type: "keydown", key: "x", code: "KeyX" } as any);
    app.scheduler.flush();

    expect(value.value).toBe(`a${complexEmojis.join("")}xb`);
    app.dispose();
  });

  it("backspace deletes an emoji in one keystroke", async () => {
    const value = ref("👀");
    const App = defineComponent({
      name: "EmojiBackspaceApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 10,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
            cursorToEndOnFirstFocus: true,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 3, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({
      type: "keydown",
      key: "Backspace",
      code: "Backspace",
    } as any);
    app.scheduler.flush();

    expect(value.value).toBe("");
    app.dispose();
  });

  it("delete removes an emoji at the cursor in one keystroke", async () => {
    const value = ref("👀");
    const App = defineComponent({
      name: "EmojiDeleteApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 10,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
          });
      },
    });

    const app = createTerminalApp({ cols: 20, rows: 3, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    app.events.dispatch({
      type: "keydown",
      key: "Delete",
      code: "Delete",
    } as any);
    app.scheduler.flush();

    expect(value.value).toBe("");
    app.dispose();
  });

  it("backspace/delete remove complex emoji sequences in one keystroke", async () => {
    const value = ref(`a${complexEmojis.join("")}b`);
    const App = defineComponent({
      name: "ComplexEmojiDeleteApp",
      setup() {
        return () =>
          h(TInput as any, {
            x: 0,
            y: 0,
            w: 40,
            modelValue: value.value,
            "onUpdate:modelValue": (v: string) => (value.value = v),
            autoFocus: true,
            cursorBlink: false,
          });
      },
    });

    const app = createTerminalApp({ cols: 60, rows: 3, component: App as any });
    app.mount();
    await nextTick();
    await nextTick();
    app.scheduler.flush();

    // Delete the first emoji after 'a'.
    app.events.dispatch({
      type: "keydown",
      key: "ArrowRight",
      code: "ArrowRight",
    } as any);
    app.events.dispatch({
      type: "keydown",
      key: "Delete",
      code: "Delete",
    } as any);
    app.scheduler.flush();

    const withoutFirst = complexEmojis.slice(1).join("");
    expect(value.value).toBe(`a${withoutFirst}b`);

    // Backspace should remove the last emoji before 'b'.
    app.events.dispatch({ type: "keydown", key: "End", code: "End" } as any);
    app.events.dispatch({
      type: "keydown",
      key: "ArrowLeft",
      code: "ArrowLeft",
    } as any);
    app.events.dispatch({
      type: "keydown",
      key: "Backspace",
      code: "Backspace",
    } as any);
    app.scheduler.flush();

    const withoutFirstAndLast = complexEmojis.slice(1, -1).join("");
    expect(value.value).toBe(`a${withoutFirstAndLast}b`);
    app.dispose();
  });
});
