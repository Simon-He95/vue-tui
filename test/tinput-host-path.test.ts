import { describe, expect, it } from "vitest";
import { pathToTerminalFileHref } from "../src/vue/components/input/host.js";

describe("TInput host path hrefs", () => {
  it("normalizes file URLs through URL parsing", () => {
    expect(pathToTerminalFileHref("file:///tmp/a%20b")).toBe("file:///tmp/a%20b");
    expect(pathToTerminalFileHref("file://server/share/a%20b")).toBe("file://server/share/a%20b");
  });

  it("rejects literal whitespace in raw file URLs", () => {
    expect(pathToTerminalFileHref("file:///tmp/a b")).toBeUndefined();
    expect(pathToTerminalFileHref("file://server/share/a b")).toBeUndefined();
  });

  it("rejects invalid or control-character file URLs", () => {
    expect(pathToTerminalFileHref("file:///tmp/a\u0007b")).toBeUndefined();
    expect(pathToTerminalFileHref("file://[::1")).toBeUndefined();
  });

  it("rejects encoded CRLF in file hrefs", () => {
    expect(pathToTerminalFileHref("file:///tmp/a%0ab")).toBeUndefined();
    expect(pathToTerminalFileHref("file:///tmp/a%0Db")).toBeUndefined();
    expect(pathToTerminalFileHref("/tmp/a%0ab")).toBeUndefined();
  });

  it("keeps absolute platform paths encoded as file URLs", () => {
    expect(pathToTerminalFileHref("/tmp/a b")).toBe("file:///tmp/a%20b");
    expect(pathToTerminalFileHref("C:\\tmp\\a b")).toBe("file:///C:/tmp/a%20b");
  });

  it("encodes reserved path characters in absolute file paths", () => {
    expect(pathToTerminalFileHref("/tmp/a#b?.txt")).toBe("file:///tmp/a%23b%3F.txt");
    expect(pathToTerminalFileHref("/tmp/100% done.txt")).toBe("file:///tmp/100%25%20done.txt");
    expect(pathToTerminalFileHref("C:\\tmp\\a#b?.txt")).toBe("file:///C:/tmp/a%23b%3F.txt");
  });

  it("keeps UNC hosts in file URLs", () => {
    expect(pathToTerminalFileHref("\\\\server\\share\\a b.txt")).toBe(
      "file://server/share/a%20b.txt",
    );
    expect(pathToTerminalFileHref("//server/share/a b.txt")).toBe("file://server/share/a%20b.txt");
  });
});
