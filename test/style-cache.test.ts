import { describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import { createTerminalApp, TerminalProvider, useTerminal } from "../src/index.js";
import { defaultActiveStyle, defaultDimStyle } from "../src/vue/utils/style-cache.js";

describe("derived style cache", () => {
  it("reuses cached derived styles for frozen base styles", () => {
    const base = Object.freeze({ fg: "red" });

    const active = defaultActiveStyle(base);
    const dim = defaultDimStyle(base);

    expect(defaultActiveStyle(base)).toBe(active);
    expect(defaultDimStyle(base)).toBe(dim);
    expect(Object.isFrozen(active)).toBe(true);
    expect(Object.isFrozen(dim)).toBe(true);
  });

  it("does not reuse stale derived styles for mutable base styles", () => {
    const base = { fg: "red" };

    const active = defaultActiveStyle(base);
    const dim = defaultDimStyle(base);
    base.fg = "blue";

    expect(defaultActiveStyle(base)).not.toBe(active);
    expect(defaultActiveStyle(base)).toMatchObject({ fg: "blue", inverse: true });
    expect(defaultDimStyle(base)).not.toBe(dim);
    expect(defaultDimStyle(base)).toMatchObject({ fg: "blue", dim: true });
  });

  it("freezes only the internal default style", () => {
    let implicitDefaultFrozen = false;
    const ImplicitProbe = defineComponent({
      name: "ImplicitDefaultStyleProbe",
      setup() {
        implicitDefaultFrozen = Object.isFrozen(useTerminal().defaultStyle.value);
        return () => null;
      },
    });
    const implicit = createTerminalApp({ cols: 4, rows: 2, component: ImplicitProbe });

    const explicitStyle = { fg: "red" };
    let explicitDefaultStyle: unknown = null;
    const ExplicitProbe = defineComponent({
      name: "ExplicitDefaultStyleProbe",
      setup() {
        explicitDefaultStyle = useTerminal().defaultStyle.value;
        return () => null;
      },
    });
    const explicit = createTerminalApp({
      cols: 4,
      rows: 2,
      component: ExplicitProbe,
      defaultStyle: explicitStyle,
    });

    try {
      implicit.mount();
      explicit.mount();

      expect(implicitDefaultFrozen).toBe(true);
      expect(explicitDefaultStyle).toMatchObject(explicitStyle);
      expect(Object.isFrozen(explicitDefaultStyle)).toBe(false);
    } finally {
      implicit.dispose();
      explicit.dispose();
    }
  });

  it("freezes TerminalProvider internal default style", async () => {
    let providerDefaultFrozen = false;
    const Probe = defineComponent({
      name: "TerminalProviderDefaultStyleProbe",
      setup() {
        providerDefaultFrozen = Object.isFrozen(useTerminal().defaultStyle.value);
        return () => null;
      },
    });
    const root = document.createElement("div");
    const app = createApp({
      name: "TerminalProviderDefaultStyleApp",
      render() {
        return h(TerminalProvider, { cols: 4, rows: 2 }, { default: () => h(Probe) });
      },
    });

    try {
      app.mount(root);
      await nextTick();

      expect(providerDefaultFrozen).toBe(true);
    } finally {
      app.unmount();
    }
  });
});
