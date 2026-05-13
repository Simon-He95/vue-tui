import { describe, expect, it } from "vitest";
import { pathToTerminalFileHref } from "../src/vue/components/input/host.js";

describe("TInput host path hrefs", () => {
  it("normalizes file URLs through URL parsing", () => {
    expect(pathToTerminalFileHref("file:///tmp/a b")).toBe("file:///tmp/a%20b");
    expect(pathToTerminalFileHref("file://server/share/a b")).toBe("file://server/share/a%20b");
  });

  it("rejects invalid or control-character file URLs", () => {
    expect(pathToTerminalFileHref("file:///tmp/a\u0007b")).toBeUndefined();
    expect(pathToTerminalFileHref("file://[::1")).toBeUndefined();
  });

  it("keeps absolute platform paths encoded as file URLs", () => {
    expect(pathToTerminalFileHref("/tmp/a b")).toBe("file:///tmp/a%20b");
    expect(pathToTerminalFileHref("C:\\tmp\\a b")).toBe("file:///C:/tmp/a%20b");
  });
});
