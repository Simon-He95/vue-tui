import { describe, expect, it } from "vitest";
import { detectTerminalColorCapability } from "../src/index.js";

describe("terminal capability", () => {
  it("folds truecolor into 256 level", () => {
    const cap = detectTerminalColorCapability({
      env: { DIMCODE_COLOR_MODE: "truecolor" },
      isTTY: true,
    });
    expect(cap).toEqual({ mode: "truecolor", level: 256 });
  });

  it("uses ansi8 for dumb terminals", () => {
    const cap = detectTerminalColorCapability({
      env: { TERM: "dumb" },
      isTTY: true,
    });
    expect(cap).toEqual({ mode: "ansi8", level: 8 });
  });

  it("defaults to ansi16 for unknown TTYs", () => {
    const cap = detectTerminalColorCapability({ env: {}, isTTY: true });
    expect(cap).toEqual({ mode: "ansi16", level: 16 });
  });

  it("uses truecolor for non-TTY outputs", () => {
    const cap = detectTerminalColorCapability({ env: {}, isTTY: false });
    expect(cap).toEqual({ mode: "truecolor", level: 256 });
  });

  it("treats Windows Terminal hints as truecolor", () => {
    const cap = detectTerminalColorCapability({
      env: { WT_SESSION: "1" },
      isTTY: true,
      platform: "win32",
    });
    expect(cap).toEqual({ mode: "truecolor", level: 256 });
  });

  it("does not trust COLORTERM=truecolor in Apple Terminal", () => {
    const cap = detectTerminalColorCapability({
      env: {
        TERM_PROGRAM: "Apple_Terminal",
        COLORTERM: "truecolor",
        TERM: "xterm-256color",
      },
      isTTY: true,
      platform: "darwin",
    });
    expect(cap).toEqual({ mode: "ansi256", level: 256 });
  });

  it("still allows explicit color mode override in Apple Terminal", () => {
    const cap = detectTerminalColorCapability({
      env: {
        TERM_PROGRAM: "Apple_Terminal",
        COLORTERM: "truecolor",
        TERM: "xterm-256color",
        DIMCODE_COLOR_MODE: "truecolor",
      },
      isTTY: true,
      platform: "darwin",
    });
    expect(cap).toEqual({ mode: "truecolor", level: 256 });
  });

  it("supports DIMCODE_COLOR_MODE as legacy override alias", () => {
    const cap = detectTerminalColorCapability({
      env: { DIMCODE_COLOR_MODE: "ansi16" },
      isTTY: true,
      platform: "darwin",
    });
    expect(cap).toEqual({ mode: "ansi16", level: 16 });
  });

  it("prefers VUE_TUI_COLOR_MODE over the legacy DIMCODE alias", () => {
    const cap = detectTerminalColorCapability({
      env: { VUE_TUI_COLOR_MODE: "ansi8", DIMCODE_COLOR_MODE: "truecolor" },
      isTTY: true,
    });
    expect(cap).toEqual({ mode: "ansi8", level: 8 });
  });

  it("falls back to legacy color env when the new env is empty", () => {
    const cap = detectTerminalColorCapability({
      env: {
        VUE_TUI_COLOR_MODE: "",
        DIMCODE_COLOR_MODE: "ansi256",
      },
      isTTY: true,
    });
    expect(cap).toEqual({ mode: "ansi256", level: 256 });
  });

  it("falls back to legacy color env when the new env is invalid", () => {
    const cap = detectTerminalColorCapability({
      env: {
        VUE_TUI_COLOR_MODE: "bogus",
        DIMCODE_COLOR_MODE: "ansi16",
      },
      isTTY: true,
    });
    expect(cap).toEqual({ mode: "ansi16", level: 16 });
  });

  it("keeps Windows hint-based truecolor detection intact", () => {
    const cap = detectTerminalColorCapability({
      env: {
        TERM_PROGRAM: "Apple_Terminal",
        COLORTERM: "truecolor",
        TERM: "xterm-256color",
        WT_SESSION: "1",
      },
      isTTY: true,
      platform: "win32",
    });
    expect(cap).toEqual({ mode: "truecolor", level: 256 });
  });
});
