import { afterEach, describe, expect, it, vi } from "vitest";
import { isProxy, watch } from "vue";
import { createAgentTranscriptStore } from "../examples/agent-console/src/transcript-store.js";

afterEach(() => vi.unstubAllEnvs());

describe("Agent Console Markdown snapshot publication", () => {
  it("publishes replacement snapshots and notifies readers through append, clear and replay", () => {
    vi.stubEnv("AGENT_CONSOLE_PROFILE_MODE", "");
    const store = createAgentTranscriptStore();
    const notifications = vi.fn();
    const stop = watch(store.markdownBlocks, notifications, { flush: "sync" });
    try {
      store.apply({ type: "assistant-delta", text: "original ENOENT 中文🙂" });
      expect(notifications).not.toHaveBeenCalled();
      const first = store.syncMarkdownBlocks();
      const firstJson = JSON.stringify(first);
      expect(notifications).toHaveBeenCalledTimes(1);
      expect(isProxy(first)).toBe(false);
      expect(isProxy(first[0])).toBe(false);
      expect(store.syncMarkdownBlocks()).toBe(first);
      expect(notifications).toHaveBeenCalledTimes(1);

      store.apply({ type: "assistant-delta", text: " followed by EACCES" });
      expect(store.markdownBlocks.value).toBe(first);
      const second = store.syncMarkdownBlocks();
      expect(second).not.toBe(first);
      expect(JSON.stringify(first)).toBe(firstJson);
      expect(JSON.stringify(second)).toContain("followed by EACCES");
      expect(notifications).toHaveBeenCalledTimes(2);

      const replay = store.captureReplayLog();
      store.clear();
      expect(store.markdownBlocks.value).toEqual([]);
      expect(notifications).toHaveBeenCalledTimes(3);
      store.loadReplayLog(replay);
      const restored = store.syncMarkdownBlocks();
      expect(restored).toEqual(second);
      expect(isProxy(restored)).toBe(false);
      expect(notifications.mock.calls.at(-1)?.[0]).toBe(restored);
    } finally {
      stop();
    }
  });
});
