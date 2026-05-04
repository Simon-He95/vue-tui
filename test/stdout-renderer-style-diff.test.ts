import process from "node:process";
import { describe, expect, it } from "vitest";
import { createStdoutRenderer, createTerminal } from "../src/index.js";

describe("stdout renderer style diffing", () => {
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
});
