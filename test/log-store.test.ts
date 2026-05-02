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

  it("keeps completed line keys stable across append", () => {
    const store = createAppendOnlyLogStore();

    store.appendLines(["a", "b"]);
    const key0 = store.source.getLineKey!(0);
    const key1 = store.source.getLineKey!(1);

    store.appendLine("c");

    expect(store.source.getLineKey!(0)).toBe(key0);
    expect(store.source.getLineKey!(1)).toBe(key1);
    expect(store.source.getLineKey!(2)).not.toBe(key1);
  });

  it("changes tail keys when tail text changes", () => {
    const store = createAppendOnlyLogStore();

    store.appendChunk("a");
    const key0 = store.source.getLineKey!(0);

    store.appendChunk("b");
    const key1 = store.source.getLineKey!(0);

    store.replaceTail("c");
    const key2 = store.source.getLineKey!(0);

    expect(key1).not.toBe(key0);
    expect(key2).not.toBe(key1);
  });

  it("moves a completed tail to a completed line key", () => {
    const store = createAppendOnlyLogStore();

    store.appendChunk("a");
    const tailKey = store.source.getLineKey!(0);

    store.appendChunk("b\nc");

    expect(store.source.getLine(0)).toBe("ab");
    expect(store.source.getLine(1)).toBe("c");
    expect(store.source.getLineKey!(0)).not.toBe(tailKey);
    expect(store.source.getLineKey!(1)).not.toBe(tailKey);
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
