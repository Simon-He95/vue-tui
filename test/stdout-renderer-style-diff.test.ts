import process from "node:process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { defaultVueTuiProfileLogPath } from "../src/cli/node-file-writers.js";
import { createTerminal } from "../src/index.js";
import { sanitizeTerminalHref } from "../src/core.js";
import { createStdoutRenderer, STDOUT_RENDERER_CAPABILITIES } from "../src/cli.js";

function hrefHash10Legacy(href: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < href.length; i++) {
    h ^= href.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h ^ (h >>> 16) ^ (h >>> 22)) & 0x3ff;
}

function findHrefHashCollision(): readonly [string, string] {
  const seen = new Map<number, string>();
  for (let i = 0; i < 10_000; i++) {
    const href = `https://collision.example/${i.toString(36)}`;
    const hash = hrefHash10Legacy(href);
    const previous = seen.get(hash);
    if (previous && previous !== href) return [previous, href];
    seen.set(hash, href);
  }
  throw new Error("failed to find href hash collision");
}

describe("stdout renderer style diffing", () => {
  it("uses a platform temp path for default profiler logs", () => {
    expect(defaultVueTuiProfileLogPath()).toBe(join(tmpdir(), "vue-tui-profile.log"));
  });

  it("exposes stdout renderer capabilities", () => {
    const terminal = createTerminal({ cols: 2, rows: 1 });
    const renderer = createStdoutRenderer(terminal, {
      output: { isTTY: false, write: () => {} },
      clear: false,
      hideCursor: false,
      altScreen: false,
    });

    try {
      expect(renderer.capabilities).toBe(STDOUT_RENDERER_CAPABILITIES);
      expect(renderer.capabilities).toEqual({
        syncFlush: true,
        scrollOperations: true,
        domRows: false,
      });
    } finally {
      renderer.dispose();
      terminal.dispose();
    }
  });

  it("recomputes terminal row fingerprints when stdout theme defaultBg changes", () => {
    const terminal = createTerminal({ cols: 4, rows: 1 });
    const renderer = createStdoutRenderer(terminal, {
      output: { isTTY: false, write: () => {} },
      clear: false,
      hideCursor: false,
      altScreen: false,
      defaultBg: "black",
    });

    try {
      const before = Array.from(terminal.getRowFingerprints(0)!);

      renderer.updateTheme?.({ defaultBg: "blue" });

      const after = Array.from(terminal.getRowFingerprints(0)!);
      expect(after).not.toEqual(before);
    } finally {
      renderer.dispose();
      terminal.dispose();
    }
  });

  it("passes file writer to stdout profiler", () => {
    const previousProfile = process.env.VUE_TUI_PROFILE;
    const previousFormat = process.env.VUE_TUI_PROFILE_FORMAT;
    const previousDest = process.env.VUE_TUI_PROFILE_LOG_DEST;
    const previousPath = process.env.VUE_TUI_PROFILE_LOG_PATH;
    const previousEvery = process.env.VUE_TUI_PROFILE_LOG_EVERY_MS;

    process.env.VUE_TUI_PROFILE = "1";
    process.env.VUE_TUI_PROFILE_FORMAT = "text";
    process.env.VUE_TUI_PROFILE_LOG_DEST = "file";
    process.env.VUE_TUI_PROFILE_LOG_PATH = "/tmp/vue-tui-profile-test.log";
    process.env.VUE_TUI_PROFILE_LOG_EVERY_MS = "100";
    vi.useFakeTimers();

    const writes: string[] = [];
    const terminal = createTerminal({ cols: 1, rows: 1 });
    const renderer = createStdoutRenderer(terminal, {
      output: { isTTY: false, write: () => {} },
      clear: false,
      hideCursor: false,
      altScreen: false,
      profileFileWriter: {
        appendFileSync: (_path, data) => writes.push(data),
      },
    });

    try {
      terminal.put(0, 0, "x");
      terminal.commit({ sync: true });
      vi.advanceTimersByTime(100);

      expect(writes.join("")).toContain("[VUE_TUI_PROFILE] stdout-renderer");
    } finally {
      renderer.dispose();
      terminal.dispose();
      vi.clearAllTimers();
      vi.useRealTimers();
      if (previousProfile == null) delete process.env.VUE_TUI_PROFILE;
      else process.env.VUE_TUI_PROFILE = previousProfile;
      if (previousFormat == null) delete process.env.VUE_TUI_PROFILE_FORMAT;
      else process.env.VUE_TUI_PROFILE_FORMAT = previousFormat;
      if (previousDest == null) delete process.env.VUE_TUI_PROFILE_LOG_DEST;
      else process.env.VUE_TUI_PROFILE_LOG_DEST = previousDest;
      if (previousPath == null) delete process.env.VUE_TUI_PROFILE_LOG_PATH;
      else process.env.VUE_TUI_PROFILE_LOG_PATH = previousPath;
      if (previousEvery == null) delete process.env.VUE_TUI_PROFILE_LOG_EVERY_MS;
      else process.env.VUE_TUI_PROFILE_LOG_EVERY_MS = previousEvery;
    }
  });

  it("defaults stdout profiler logs to file", () => {
    const previousProfile = process.env.VUE_TUI_PROFILE;
    const previousFormat = process.env.VUE_TUI_PROFILE_FORMAT;
    const previousDest = process.env.VUE_TUI_PROFILE_LOG_DEST;
    const previousPath = process.env.VUE_TUI_PROFILE_LOG_PATH;
    const previousEvery = process.env.VUE_TUI_PROFILE_LOG_EVERY_MS;

    process.env.VUE_TUI_PROFILE = "1";
    process.env.VUE_TUI_PROFILE_FORMAT = "text";
    delete process.env.VUE_TUI_PROFILE_LOG_DEST;
    delete process.env.VUE_TUI_PROFILE_LOG_PATH;
    process.env.VUE_TUI_PROFILE_LOG_EVERY_MS = "100";
    vi.useFakeTimers();

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const writes: string[] = [];
    const terminal = createTerminal({ cols: 1, rows: 1 });
    const renderer = createStdoutRenderer(terminal, {
      output: { isTTY: false, write: () => {} },
      clear: false,
      hideCursor: false,
      altScreen: false,
      profileFileWriter: {
        appendFileSync: (_path, data) => writes.push(data),
      },
    });

    try {
      terminal.put(0, 0, "x");
      terminal.commit({ sync: true });
      vi.advanceTimersByTime(100);

      expect(writes.join("")).toContain("[VUE_TUI_PROFILE] stdout-renderer");
      expect(log).not.toHaveBeenCalled();
    } finally {
      renderer.dispose();
      terminal.dispose();
      log.mockRestore();
      vi.clearAllTimers();
      vi.useRealTimers();
      if (previousProfile == null) delete process.env.VUE_TUI_PROFILE;
      else process.env.VUE_TUI_PROFILE = previousProfile;
      if (previousFormat == null) delete process.env.VUE_TUI_PROFILE_FORMAT;
      else process.env.VUE_TUI_PROFILE_FORMAT = previousFormat;
      if (previousDest == null) delete process.env.VUE_TUI_PROFILE_LOG_DEST;
      else process.env.VUE_TUI_PROFILE_LOG_DEST = previousDest;
      if (previousPath == null) delete process.env.VUE_TUI_PROFILE_LOG_PATH;
      else process.env.VUE_TUI_PROFILE_LOG_PATH = previousPath;
      if (previousEvery == null) delete process.env.VUE_TUI_PROFILE_LOG_EVERY_MS;
      else process.env.VUE_TUI_PROFILE_LOG_EVERY_MS = previousEvery;
    }
  });

  it("sanitizes terminal hrefs before OSC8 output", () => {
    expect(sanitizeTerminalHref(" https://example.com")).toBeNull();
    expect(sanitizeTerminalHref("https://example.com ")).toBeNull();
    expect(sanitizeTerminalHref(" mailto:test@example.com")).toBeNull();
    expect(sanitizeTerminalHref("http://example.com")).toBe("http://example.com");
    expect(sanitizeTerminalHref("mailto:test@example.com")).toBe("mailto:test@example.com");
    expect(sanitizeTerminalHref("vbscript:msgbox(1)")).toBeNull();
    expect(sanitizeTerminalHref("javascript:alert(1)")).toBeNull();
    expect(sanitizeTerminalHref("data:text/html,hi")).toBeNull();
    expect(sanitizeTerminalHref("//evil.example")).toBeNull();
    expect(sanitizeTerminalHref("file:///tmp/a")).toBeNull();
    expect(sanitizeTerminalHref("https:example.com")).toBeNull();
    expect(sanitizeTerminalHref("http:\\example.com")).toBeNull();
    expect(sanitizeTerminalHref("https://a.com\u0007bad")).toBeNull();
    expect(sanitizeTerminalHref("https://a.com\u001B]8;;x")).toBeNull();
    expect(sanitizeTerminalHref("https://example.com/a b")).toBeNull();
    expect(sanitizeTerminalHref("https://example.com/a%20b")).toBe("https://example.com/a%20b");
    expect(sanitizeTerminalHref("https://example.com/%0aevil")).toBeNull();
    expect(sanitizeTerminalHref("https://example.com/%80")).toBeNull();
    expect(sanitizeTerminalHref("https://example.com/%9f")).toBeNull();
    expect(sanitizeTerminalHref("mailto:a@b.com?subject=x%0aBCC:c@d.com")).toBeNull();
    expect(sanitizeTerminalHref("mailto:a@b.com?subject=x%0DBCC:c@d.com")).toBeNull();
    expect(sanitizeTerminalHref("mailto:a@b.com?subject=ok")).toBe("mailto:a@b.com?subject=ok");
    expect(sanitizeTerminalHref("mailto:test@example.com?subject=Hello World")).toBeNull();
    expect(sanitizeTerminalHref("mailto:test@example.com?subject=Hello%20World")).toBe(
      "mailto:test@example.com?subject=Hello%20World",
    );
  });

  it("does not emit unsafe OSC8 hrefs", () => {
    const previousTermProgram = process.env.TERM_PROGRAM;
    const previousVscodePid = process.env.VSCODE_PID;
    const previousVscodeHook = process.env.VSCODE_IPC_HOOK_CLI;
    process.env.TERM_PROGRAM = "xterm";
    delete process.env.VSCODE_PID;
    delete process.env.VSCODE_IPC_HOOK_CLI;
    try {
      const terminal = createTerminal({ cols: 2, rows: 1 });
      let out = "";
      const output = {
        isTTY: true,
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

      terminal.put(0, 0, "x", { underline: true, href: "https://a.com\u0007bad" });
      terminal.put(1, 0, "y", { underline: true, href: "https://safe.example" });
      terminal.commit({ sync: true });

      expect(out).toContain("https://safe.example");
      expect(out).not.toContain("https://a.com");
      expect(out).not.toContain("\u001B]8;;https://a.com");

      renderer.dispose();
    } finally {
      if (previousTermProgram == null) delete process.env.TERM_PROGRAM;
      else process.env.TERM_PROGRAM = previousTermProgram;
      if (previousVscodePid == null) delete process.env.VSCODE_PID;
      else process.env.VSCODE_PID = previousVscodePid;
      if (previousVscodeHook == null) delete process.env.VSCODE_IPC_HOOK_CLI;
      else process.env.VSCODE_IPC_HOOK_CLI = previousVscodeHook;
    }
  });

  it("filters file OSC8 hrefs by default", () => {
    const previousTermProgram = process.env.TERM_PROGRAM;
    const previousVscodePid = process.env.VSCODE_PID;
    const previousVscodeHook = process.env.VSCODE_IPC_HOOK_CLI;
    process.env.TERM_PROGRAM = "xterm";
    delete process.env.VSCODE_PID;
    delete process.env.VSCODE_IPC_HOOK_CLI;
    try {
      const terminal = createTerminal({ cols: 4, rows: 1 });
      let out = "";
      const output = {
        isTTY: true,
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

      terminal.put(0, 0, "f", { href: "file:///tmp/a.txt" });
      terminal.put(1, 0, "i", { href: "file:///tmp/a.txt" });
      terminal.put(2, 0, "l", { href: "file:///tmp/a.txt" });
      terminal.put(3, 0, "e", { href: "file:///tmp/a.txt" });
      terminal.commit({ sync: true });

      expect(out).not.toContain("file://");

      renderer.dispose();
      terminal.dispose();
    } finally {
      if (previousTermProgram == null) delete process.env.TERM_PROGRAM;
      else process.env.TERM_PROGRAM = previousTermProgram;
      if (previousVscodePid == null) delete process.env.VSCODE_PID;
      else process.env.VSCODE_PID = previousVscodePid;
      if (previousVscodeHook == null) delete process.env.VSCODE_IPC_HOOK_CLI;
      else process.env.VSCODE_IPC_HOOK_CLI = previousVscodeHook;
    }
  });

  it("emits OSC8 file hrefs when file urls are allowed", () => {
    const previousTermProgram = process.env.TERM_PROGRAM;
    const previousVscodePid = process.env.VSCODE_PID;
    const previousVscodeHook = process.env.VSCODE_IPC_HOOK_CLI;
    process.env.TERM_PROGRAM = "xterm";
    delete process.env.VSCODE_PID;
    delete process.env.VSCODE_IPC_HOOK_CLI;
    try {
      const terminal = createTerminal({ cols: 4, rows: 1 });
      let out = "";
      const output = {
        isTTY: true,
        write(chunk: string) {
          out += chunk;
        },
      };

      const renderer = createStdoutRenderer(terminal, {
        output,
        clear: false,
        hideCursor: false,
        altScreen: false,
        allowFileUrls: true,
      });

      terminal.put(0, 0, "f", { href: "file:///tmp/a.txt" });
      terminal.put(1, 0, "i", { href: "file:///tmp/a.txt" });
      terminal.put(2, 0, "l", { href: "file:///tmp/a.txt" });
      terminal.put(3, 0, "e", { href: "file:///tmp/a.txt" });
      terminal.commit({ sync: true });

      expect(out).toContain("\x1B]8;;file:///tmp/a.txt\x07");

      renderer.dispose();
      terminal.dispose();
    } finally {
      if (previousTermProgram == null) delete process.env.TERM_PROGRAM;
      else process.env.TERM_PROGRAM = previousTermProgram;
      if (previousVscodePid == null) delete process.env.VSCODE_PID;
      else process.env.VSCODE_PID = previousVscodePid;
      if (previousVscodeHook == null) delete process.env.VSCODE_IPC_HOOK_CLI;
      else process.env.VSCODE_IPC_HOOK_CLI = previousVscodeHook;
    }
  });

  it("avoids per-run resets when only setting attributes", () => {
    const terminal = createTerminal({ cols: 4, rows: 1 });
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
    terminal.put(0, 0, "A", { fg: "red" });
    terminal.put(1, 0, "B", { fg: "green" });
    terminal.put(2, 0, "C", { fg: "blue" });
    terminal.put(3, 0, "D", { fg: "yellow" });
    terminal.commit({ sync: true });

    const resets = out.match(/\u001B\[0m/g) ?? [];
    // Reset at frame start + reset to clear fg before EOL clear + reset at frame end.
    // Critically, we do not emit a reset for every color run.
    expect(resets.length).toBe(3);

    renderer.dispose();
  });

  it("re-emits OSC8 links when only href changes", () => {
    const previousTermProgram = process.env.TERM_PROGRAM;
    const previousVscodePid = process.env.VSCODE_PID;
    const previousVscodeHook = process.env.VSCODE_IPC_HOOK_CLI;
    process.env.TERM_PROGRAM = "xterm";
    delete process.env.VSCODE_PID;
    delete process.env.VSCODE_IPC_HOOK_CLI;
    try {
      const terminal = createTerminal({ cols: 4, rows: 1 });
      let out = "";
      const output = {
        isTTY: true,
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

      terminal.put(0, 0, "o", { underline: true, href: "https://a.example" });
      terminal.put(1, 0, "k", { underline: true, href: "https://a.example" });
      terminal.commit({ sync: true });

      out = "";
      terminal.put(0, 0, "o", { underline: true, href: "https://b.example" });
      terminal.put(1, 0, "k", { underline: true, href: "https://b.example" });
      terminal.commit({ sync: true });

      expect(out).toContain("https://b.example");
      expect(out).not.toContain("https://a.example");

      renderer.dispose();
    } finally {
      if (previousTermProgram == null) delete process.env.TERM_PROGRAM;
      else process.env.TERM_PROGRAM = previousTermProgram;
      if (previousVscodePid == null) delete process.env.VSCODE_PID;
      else process.env.VSCODE_PID = previousVscodePid;
      if (previousVscodeHook == null) delete process.env.VSCODE_IPC_HOOK_CLI;
      else process.env.VSCODE_IPC_HOOK_CLI = previousVscodeHook;
    }
  });

  it("emits OSC8 boundary when adjacent segments only differ by href", () => {
    const previousTermProgram = process.env.TERM_PROGRAM;
    const previousVscodePid = process.env.VSCODE_PID;
    const previousVscodeHook = process.env.VSCODE_IPC_HOOK_CLI;

    process.env.TERM_PROGRAM = "xterm";
    delete process.env.VSCODE_PID;
    delete process.env.VSCODE_IPC_HOOK_CLI;

    try {
      const terminal = createTerminal({ cols: 2, rows: 1 });
      let out = "";
      const output = {
        isTTY: true,
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
      terminal.put(0, 0, "a", { underline: true, href: "https://a.example" });
      terminal.put(1, 0, "b", { underline: true, href: "https://b.example" });
      terminal.commit({ sync: true });

      const a = out.indexOf("\x1B]8;;https://a.example\x07");
      const b = out.indexOf("\x1B]8;;https://b.example\x07");

      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThan(a);
      expect(out).toContain("\x1B]8;;\x07");

      renderer.dispose();
      terminal.dispose();
    } finally {
      if (previousTermProgram == null) delete process.env.TERM_PROGRAM;
      else process.env.TERM_PROGRAM = previousTermProgram;

      if (previousVscodePid == null) delete process.env.VSCODE_PID;
      else process.env.VSCODE_PID = previousVscodePid;

      if (previousVscodeHook == null) delete process.env.VSCODE_IPC_HOOK_CLI;
      else process.env.VSCODE_IPC_HOOK_CLI = previousVscodeHook;
    }
  });

  it("re-emits OSC8 links even when legacy href hashes collide", () => {
    const [hrefA, hrefB] = findHrefHashCollision();
    const previousTermProgram = process.env.TERM_PROGRAM;
    const previousVscodePid = process.env.VSCODE_PID;
    const previousVscodeHook = process.env.VSCODE_IPC_HOOK_CLI;
    process.env.TERM_PROGRAM = "xterm";
    delete process.env.VSCODE_PID;
    delete process.env.VSCODE_IPC_HOOK_CLI;
    try {
      const terminal = createTerminal({ cols: 2, rows: 1 });
      let out = "";
      const output = {
        isTTY: true,
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

      terminal.put(0, 0, "o", { underline: true, href: hrefA });
      terminal.put(1, 0, "k", { underline: true, href: hrefA });
      terminal.commit({ sync: true });

      out = "";
      terminal.put(0, 0, "o", { underline: true, href: hrefB });
      terminal.put(1, 0, "k", { underline: true, href: hrefB });
      terminal.commit({ sync: true });

      expect(hrefHash10Legacy(hrefA)).toBe(hrefHash10Legacy(hrefB));
      expect(out).toContain(hrefB);
      expect(out).not.toContain(hrefA);

      renderer.dispose();
    } finally {
      if (previousTermProgram == null) delete process.env.TERM_PROGRAM;
      else process.env.TERM_PROGRAM = previousTermProgram;
      if (previousVscodePid == null) delete process.env.VSCODE_PID;
      else process.env.VSCODE_PID = previousVscodePid;
      if (previousVscodeHook == null) delete process.env.VSCODE_IPC_HOOK_CLI;
      else process.env.VSCODE_IPC_HOOK_CLI = previousVscodeHook;
    }
  });
});
