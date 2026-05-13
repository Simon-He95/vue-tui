import { describe, expect, it } from "vitest";
import { createDomRenderer, createTerminal } from "../src/index.js";
import { createStdoutRenderer } from "../src/cli.js";
import { ANSI_PALETTE_HEX } from "../src/core/ansi-palette.js";
import { getPlaneTerminal } from "../src/core/terminal/create-terminal.js";

// Make rAF deterministic for DomRenderer commit flushing.
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  cb(0);
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

describe("ansi palette parity", () => {
  it("exports a stable 16-color palette", () => {
    expect(ANSI_PALETTE_HEX).toMatchInlineSnapshot(`
      {
        "black": "#000000",
        "blackBright": "#686868",
        "blue": "#0225c7",
        "blueBright": "#6871ff",
        "cyan": "#00c5c7",
        "cyanBright": "#5ffdff",
        "green": "#00c200",
        "greenBright": "#5ffa68",
        "magenta": "#c930c7",
        "magentaBright": "#ff76ff",
        "red": "#c91b00",
        "redBright": "#ff6e67",
        "white": "#c7c7c7",
        "whiteBright": "#ffffff",
        "yellow": "#c7c400",
        "yellowBright": "#fffc67",
      }
    `);
  });

  it("DomRenderer uses CSS variables for palette colors", () => {
    const terminal = createTerminal({ cols: 3, rows: 1 });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = createDomRenderer(terminal, container);

    expect(container.style.getPropertyValue("--vt-color-red")).toBe(ANSI_PALETTE_HEX.red);
    expect(container.style.getPropertyValue("--vt-color-blue")).toBe(ANSI_PALETTE_HEX.blue);

    terminal.put(0, 0, "X", { fg: "red", bg: "blue" });
    renderer.refresh();

    const span =
      Array.from(container.querySelectorAll("span")).find((s) =>
        (s.textContent || "").includes("X"),
      ) ?? null;
    expect(span).not.toBe(null);
    expect((span as HTMLElement).style.color).toBe("var(--vt-color-red)");
    expect((span as HTMLElement).style.backgroundColor).toBe("var(--vt-color-blue)");

    renderer.dispose();
    container.remove();
  });

  it("DomRenderer supports custom palette updates through CSS variables", () => {
    const terminal = createTerminal({ cols: 3, rows: 1 });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const palette = { red: "#112233" };
    const renderer = createDomRenderer(terminal, container, { palette });

    expect(container.style.getPropertyValue("--vt-color-red")).toBe("#112233");
    expect(container.style.getPropertyValue("--vt-color-blue")).toBe(ANSI_PALETTE_HEX.blue);

    terminal.put(0, 0, "X", { fg: "red" });
    renderer.refresh();

    const span =
      Array.from(container.querySelectorAll("span")).find((s) =>
        (s.textContent || "").includes("X"),
      ) ?? null;
    expect(span).not.toBe(null);
    expect((span as HTMLElement).style.color).toBe("var(--vt-color-red)");

    renderer.updateTheme({ palette: { red: "#010203" } });
    expect(container.style.getPropertyValue("--vt-color-red")).toBe("#010203");

    renderer.updateTheme({ palette: undefined });
    expect(container.style.getPropertyValue("--vt-color-red")).toBe(ANSI_PALETTE_HEX.red);
    expect(palette).toEqual({ red: "#112233" });

    renderer.dispose();
    container.remove();
  });

  it("DomRenderer ignores unknown color names instead of emitting unresolved CSS variables", () => {
    const terminal = createTerminal({ cols: 3, rows: 1 });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = createDomRenderer(terminal, container);

    terminal.put(0, 0, "X", { fg: "unknown" as any, bg: "missing" as any });
    renderer.refresh();

    const span =
      Array.from(container.querySelectorAll("span")).find((s) =>
        (s.textContent || "").includes("X"),
      ) ?? null;
    expect(span).not.toBe(null);
    expect((span as HTMLElement).style.color).toBe("");
    expect((span as HTMLElement).style.backgroundColor).toBe("");

    renderer.dispose();
    container.remove();
  });

  it("DomRenderer maps common style attributes to CSS with inverse colors", () => {
    const terminal = createTerminal({ cols: 3, rows: 1 });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = createDomRenderer(terminal, container);

    terminal.put(0, 0, "X", {
      fg: "red",
      bg: "blue",
      bold: true,
      dim: true,
      italic: true,
      underline: true,
      inverse: true,
    });
    renderer.refresh();

    const span =
      Array.from(container.querySelectorAll("span")).find((s) =>
        (s.textContent || "").includes("X"),
      ) ?? null;
    expect(span).not.toBe(null);
    const style = (span as HTMLElement).style;
    expect(style.color).toBe("var(--vt-color-blue)");
    expect(style.backgroundColor).toBe("var(--vt-color-red)");
    expect(style.fontWeight).toBe("700");
    expect(style.opacity).toBe("0.75");
    expect(style.fontStyle).toBe("italic");
    expect(style.textDecoration).toBe("underline");

    renderer.dispose();
    container.remove();
  });

  it("DomRenderer renders terminal planes into separate layers with per-plane offsets", () => {
    const terminal = createTerminal({ cols: 4, rows: 4 });
    const transcript = getPlaneTerminal(terminal, "transcript");
    const chrome = getPlaneTerminal(terminal, "chrome");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = createDomRenderer(terminal, container);

    transcript.put(0, 0, "T", { fg: "red" });
    chrome.put(0, 0, "C", { fg: "blue" });
    transcript.commit();
    chrome.commit();

    const transcriptLayer = container.querySelector('[data-vt-plane="transcript"]');
    const chromeLayer = container.querySelector('[data-vt-plane="chrome"]');
    const transcriptContent = transcriptLayer?.firstElementChild as HTMLElement | null;
    expect(transcriptLayer?.textContent).toContain("T");
    expect(chromeLayer?.textContent).toContain("C");

    renderer.setPlaneOffset("transcript", 12);
    renderer.setPlaneViewport("transcript", { topPx: 1, heightPx: 2 });
    expect((transcriptContent as HTMLElement).style.transform).toBe("translateY(12px)");
    expect((transcriptLayer as HTMLElement).style.clipPath).toBe("inset(1px 0px 1px 0px)");

    renderer.dispose();
    container.remove();
  });

  it("StdoutRenderer emits deterministic truecolor ANSI sequences for the palette", () => {
    const terminal = createTerminal({ cols: 3, rows: 1 });
    let out = "";
    const output = {
      isTTY: false,
      write(chunk: string) {
        out += chunk;
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    out = "";
    terminal.put(0, 0, "X", { fg: "red", bg: "blue" });
    terminal.commit();

    expect(out).toContain("\u001B[38;2;201;27;0m");
    expect(out).toContain("\u001B[48;2;2;37;199m");

    renderer.dispose();
  });

  it("StdoutRenderer emits common style attributes with truecolor palette sequences", () => {
    const terminal = createTerminal({ cols: 3, rows: 1 });
    let out = "";
    const output = {
      isTTY: false,
      write(chunk: string) {
        out += chunk;
      },
    };
    const renderer = createStdoutRenderer(terminal, {
      output,
      clear: false,
      hideCursor: false,
      altScreen: false,
      colorMode: "truecolor",
    });

    terminal.put(0, 0, "X", {
      fg: "red",
      bg: "blue",
      bold: true,
      dim: true,
      italic: true,
      underline: true,
      inverse: true,
    });
    terminal.commit();

    expect(out).toContain("\u001B[38;2;201;27;0m");
    expect(out).toContain("\u001B[48;2;2;37;199m");
    expect(out).toContain("\u001B[1m");
    expect(out).toContain("\u001B[2m");
    expect(out).toContain("\u001B[3m");
    expect(out).toContain("\u001B[4m");
    expect(out).toContain("\u001B[7m");

    renderer.dispose();
  });
});
