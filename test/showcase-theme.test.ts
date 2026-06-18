import { describe, expect, it } from "vitest";
import {
  nextShowcaseThemeMode,
  showcaseAnsiPalette,
  showcaseChromeTheme,
  showcaseTerminalStyle,
  showcaseThemeModes,
  showcaseThemePresets,
  showcaseTuiTheme,
} from "../examples/basic/src/showcase-theme";

describe("basic showcase themes", () => {
  it("defines multiple complete promotional theme presets", () => {
    expect(showcaseThemeModes).toEqual(["dark", "light", "matrix", "plum"]);

    for (const mode of showcaseThemeModes) {
      const preset = showcaseThemePresets[mode];
      expect(preset.label).toBeTruthy();
      expect(showcaseTerminalStyle(mode).bg).toBe("black");
      expect(showcaseChromeTheme(mode).base.bg).toBe("black");
      expect(showcaseChromeTheme(mode).accent.fg).toBeTruthy();
      expect(showcaseTuiTheme(mode).colors?.accent).toBeTruthy();
      expect(showcaseTuiTheme(mode).components?.TTable?.headerStyle).toBeTruthy();
      if (mode === "dark") expect(showcaseAnsiPalette(mode)).toBeNull();
      else expect(showcaseAnsiPalette(mode)?.whiteBright).toBeTruthy();
    }
  });

  it("cycles terminal showcase themes in declaration order", () => {
    expect(nextShowcaseThemeMode("dark")).toBe("light");
    expect(nextShowcaseThemeMode("light")).toBe("matrix");
    expect(nextShowcaseThemeMode("matrix")).toBe("plum");
    expect(nextShowcaseThemeMode("plum")).toBe("dark");
  });
});
