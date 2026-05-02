import { describe, expect, it } from "vitest";
import { createAppendOnlyLogStore } from "../src/experimental.js";

describe("createAppendOnlyLogStore", () => {
  it("appends lines and bumps version", () => {
    const store = createAppendOnlyLogStore();

    store.appendLine("a");
    store.appendLine("b");

    expect(store.version.value).toBe(2);
    expect(store.source.lineCount()).toBe(2);
    expect(store.source.getLine(0)).toBe("a");
    expect(store.source.getLine(1)).toBe("b");
    expect(store.source.getLine(2)).toBe("");
  });

  it("appends multiple lines with one version bump", () => {
    const store = createAppendOnlyLogStore();

    store.appendLines(["a", "b", "c"]);

    expect(store.version.value).toBe(1);
    expect(store.source.lineCount()).toBe(3);
    expect(store.source.getLine(2)).toBe("c");
  });

  it("does not bump version for empty appendLines", () => {
    const store = createAppendOnlyLogStore();

    store.appendLines([]);

    expect(store.version.value).toBe(0);
    expect(store.source.lineCount()).toBe(0);
  });

  it("does not flush tail for empty appendLines", () => {
    const store = createAppendOnlyLogStore();

    store.appendChunk("partial");
    store.appendLines([]);

    expect(store.version.value).toBe(1);
    expect(store.source.lineCount()).toBe(1);
    expect(store.source.getLine(0)).toBe("partial");
  });

  it("streams chunks without rebuilding a full string", () => {
    const store = createAppendOnlyLogStore();

    store.appendChunk("a");
    store.appendChunk("b\nc");

    expect(store.version.value).toBe(2);
    expect(store.source.lineCount()).toBe(2);
    expect(store.source.getLine(0)).toBe("ab");
    expect(store.source.getLine(1)).toBe("c");
  });

  it("handles multiple newlines in one chunk", () => {
    const store = createAppendOnlyLogStore();

    store.appendChunk("a\nb\nc");

    expect(store.source.lineCount()).toBe(3);
    expect(store.source.getLine(0)).toBe("a");
    expect(store.source.getLine(1)).toBe("b");
    expect(store.source.getLine(2)).toBe("c");
  });

  it("merges appendLine into an existing tail", () => {
    const store = createAppendOnlyLogStore();

    store.appendChunk("ab");
    store.appendLine("c");

    expect(store.source.lineCount()).toBe(1);
    expect(store.source.getLine(0)).toBe("abc");
  });

  it("merges appendLines first line into an existing tail", () => {
    const store = createAppendOnlyLogStore();

    store.appendChunk("partial");
    store.appendLines(["-done", "next"]);

    expect(store.source.lineCount()).toBe(2);
    expect(store.source.getLine(0)).toBe("partial-done");
    expect(store.source.getLine(1)).toBe("next");
  });

  it("keeps replaceTail single-line", () => {
    const store = createAppendOnlyLogStore();

    store.replaceTail("a\nb\rc");

    expect(store.source.lineCount()).toBe(1);
    expect(store.source.getLine(0)).toBe("abc");
  });

  it("replaces tail and clears", () => {
    const store = createAppendOnlyLogStore();

    store.appendLine("a");
    store.replaceTail("b\rc");

    expect(store.version.value).toBe(2);
    expect(store.source.lineCount()).toBe(2);
    expect(store.source.getLine(1)).toBe("bc");

    store.clear();

    expect(store.version.value).toBe(3);
    expect(store.source.lineCount()).toBe(0);
    expect(store.source.getLine(0)).toBe("");
  });
});
