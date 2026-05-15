import { describe, expect, it } from "vitest";
import {
  dirname,
  isAbsolutePath,
  normalizePath,
  resolvePath,
  stripTrailingSlash,
} from "../src/utils/path.js";

describe("path utils", () => {
  it("normalizes and resolves posix paths", () => {
    expect(normalizePath("/a//b/./c")).toBe("/a/b/c");
    expect(normalizePath("/a/b/../c")).toBe("/a/c");
    expect(resolvePath("/root/ws", "../x")).toBe("/root/x");
    expect(resolvePath("/root/ws", "./a/..")).toBe("/root/ws");
    expect(stripTrailingSlash("/a/b/")).toBe("/a/b");
    expect(stripTrailingSlash(`/a/b${"/".repeat(200_000)}`)).toBe("/a/b");
    expect(dirname("/a/b/c")).toBe("/a/b");
  });

  it("detects absolute paths", () => {
    expect(isAbsolutePath("/a")).toBe(true);
    expect(isAbsolutePath("a/b")).toBe(false);
    expect(isAbsolutePath("C:/a")).toBe(true);
    expect(isAbsolutePath("C:\\a")).toBe(true);
  });
});
