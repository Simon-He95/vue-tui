import { describe, expect, it } from "vitest";
import { TCommandPalette, filterCommandPaletteItems } from "../src/agent.js";
import { h, mountTerminal, nextTick } from "./ui-regressions-support.js";

function lines(mounted: Awaited<ReturnType<typeof mountTerminal>>): string[] {
  const out: string[] = [];
  const { rows } = mounted.terminal.size();
  for (let y = 0; y < rows; y++) {
    out.push(
      mounted.terminal
        .getRow(y)
        .map((cell) => cell.ch)
        .join("")
        .trimEnd(),
    );
  }
  return out;
}

describe("TCommandPalette", () => {
  it("filters items with label detail and keywords", () => {
    const filtered = filterCommandPaletteItems(
      [
        { label: "Open Session", detail: "Resume work" },
        { label: "Switch Provider", keywords: ["model"] },
        { kind: "separator", label: "Providers" },
      ],
      "model",
    );

    expect(filtered.map((x) => x.item.label)).toEqual(["Switch Provider"]);
    expect(filtered[0]?.labelHighlightRanges).toEqual([]);
  });

  it("renders a searchable command surface", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TCommandPalette, {
          modelValue: true,
          title: "Commands",
          placeholder: "Find",
          hint: "Enter select",
          items: [
            { label: "Open Session", detail: "Resume work" },
            { label: "Switch Provider", detail: "Change model" },
          ],
          selectedIndex: 1,
          showRowDetails: true,
          chromeStyle: { bg: "black", fg: "whiteBright" },
          inputStyle: { bg: "black", fg: "whiteBright" },
          highlightStyle: { bg: "blue", fg: "whiteBright" },
        }),
      64,
      20,
    );

    try {
      await nextTick();
      const text = lines(mounted).join("\n");
      expect(text).toContain("Commands");
      expect(text).toContain("Open Session");
      expect(text).toContain("Switch Provider");
      expect(text).toContain("Enter select");
    } finally {
      mounted.unmount();
    }
  });
});
