import { describe, expect, it, vi } from "vitest";
import { createMarkdownPublicationController } from "../examples/agent-console/src/AgentConsoleSurface.js";

function harness(result: boolean | undefined = true) {
  let mode: "log" | "markdown" = "markdown";
  let task: (() => void) | undefined;
  const sync = vi.fn();
  const cancel = vi.fn();
  const controller = createMarkdownPublicationController({
    scheduler: {
      queueFrameTask(value) {
        task = value.run;
        return result;
      },
      cancelFrameTask: cancel,
    },
    getMode: () => mode,
    syncMarkdownBlocks: sync,
  });
  return {
    controller,
    sync,
    cancel,
    run: () => task?.(),
    mode: (value: typeof mode) => (mode = value),
  };
}

describe("Agent Console Markdown publication", () => {
  it("treats legacy undefined scheduler result as accepted and coalesces requests", () => {
    const value = harness(undefined);
    value.controller.request();
    value.controller.request();
    expect(value.sync).not.toHaveBeenCalled();
    value.run();
    expect(value.sync).toHaveBeenCalledTimes(1);
  });

  it("falls back synchronously only on explicit rejection", () => {
    const value = harness(false);
    value.controller.request();
    expect(value.sync).toHaveBeenCalledTimes(1);
  });

  it("cancels mode-exit work without hidden materialization and rejects stale callbacks", () => {
    const value = harness();
    value.controller.request();
    value.mode("log");
    value.controller.setMode("log");
    expect(value.cancel).toHaveBeenCalled();
    expect(value.sync).not.toHaveBeenCalled();
    value.run();
    expect(value.sync).not.toHaveBeenCalled();
  });

  it("cancels unmount work without materialization", () => {
    const value = harness();
    value.controller.request();
    value.controller.dispose();
    value.run();
    expect(value.sync).not.toHaveBeenCalled();
  });
});
