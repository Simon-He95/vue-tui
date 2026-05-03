import { describe, expect, it, vi } from "vitest";
import {
  handleTLogKeymapEvent,
  resolveTLogSearchBarTheme,
  resolveTLogViewTheme,
  tlogDefaultKeymap,
  tlogDefaultPreset,
  tlogHighContrastPreset,
} from "../src/experimental.js";

describe("tlog keymap and theme presets", () => {
  it("matches default key bindings and dispatches actions", () => {
    const searchNext = vi.fn();
    const preventDefault = vi.fn();

    const handled = handleTLogKeymapEvent(
      {
        key: "F3",
        preventDefault,
      },
      tlogDefaultKeymap,
      { searchNext },
    );

    expect(handled).toBe(true);
    expect(searchNext).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("exposes theme presets through helper mappers", () => {
    expect(tlogDefaultPreset.keymap.searchNext).toContain("f3");
    expect(tlogHighContrastPreset.theme.base).toMatchObject({ bg: "black" });
    expect(resolveTLogViewTheme(tlogDefaultPreset.theme)).toMatchObject({
      matchStyle: tlogDefaultPreset.theme.search?.match,
      currentMatchStyle: tlogDefaultPreset.theme.search?.currentMatch,
    });
    expect(resolveTLogSearchBarTheme(tlogHighContrastPreset.theme)).toMatchObject({
      style: tlogHighContrastPreset.theme.base,
      activeStyle: tlogHighContrastPreset.theme.search?.active,
    });
  });
});
