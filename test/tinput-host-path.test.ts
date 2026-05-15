import { describe, expect, it } from "vitest";
import { fileUrlToPathLike, pathToTerminalFileHref } from "../src/vue/components/input/host.js";

describe("TInput host path hrefs", () => {
  it("normalizes file URLs through URL parsing", () => {
    expect(pathToTerminalFileHref("file:///tmp/a%20b")).toBe("file:///tmp/a%20b");
    expect(pathToTerminalFileHref("file://server/share/a%20b")).toBe("file://server/share/a%20b");
  });

  it("rejects literal whitespace in raw file URLs", () => {
    expect(pathToTerminalFileHref("file:///tmp/a b")).toBeUndefined();
    expect(pathToTerminalFileHref("file://server/share/a b")).toBeUndefined();
  });

  it("rejects whitespace around raw file URLs", () => {
    expect(pathToTerminalFileHref(" file:///tmp/a")).toBeUndefined();
    expect(pathToTerminalFileHref("file:///tmp/a ")).toBeUndefined();
  });

  it("rejects invalid or control-character file URLs", () => {
    expect(pathToTerminalFileHref("file:///tmp/a\u0007b")).toBeUndefined();
    expect(pathToTerminalFileHref("file://[::1")).toBeUndefined();
  });

  it("rejects encoded controls in raw file URLs", () => {
    expect(pathToTerminalFileHref("file:///tmp/a%0ab")).toBeUndefined();
    expect(pathToTerminalFileHref("file:///tmp/a%0Db")).toBeUndefined();
    expect(pathToTerminalFileHref("file:///tmp/a%1Bb")).toBeUndefined();
    expect(pathToTerminalFileHref("file:///tmp/a%7fb")).toBeUndefined();
    expect(pathToTerminalFileHref("file:///tmp/%80bad")).toBeUndefined();
    expect(pathToTerminalFileHref("file:///tmp/a%20b")).toBe("file:///tmp/a%20b");
  });

  it("rejects encoded control characters in pasted file URLs", () => {
    expect(fileUrlToPathLike("file:///tmp/%00bad")).toBeNull();
    expect(fileUrlToPathLike("file:///tmp/%0abad")).toBeNull();
    expect(fileUrlToPathLike("file:///tmp/%7fbad")).toBeNull();
    expect(fileUrlToPathLike("file:///tmp/%80bad")).toBeNull();
    expect(fileUrlToPathLike("file:///tmp/%9fbad")).toBeNull();
  });

  it("still accepts encoded spaces in file URLs", () => {
    expect(fileUrlToPathLike("file:///tmp/a%20b.txt")).toBe("/tmp/a b.txt");
  });

  it("keeps absolute platform paths encoded as file URLs", () => {
    expect(pathToTerminalFileHref("/tmp/a b")).toBe("file:///tmp/a%20b");
    expect(pathToTerminalFileHref("/tmp/a ")).toBe("file:///tmp/a%20");
    expect(pathToTerminalFileHref("C:\\tmp\\a b")).toBe("file:///C:/tmp/a%20b");
  });

  it("encodes percent-looking filesystem paths instead of rejecting them", () => {
    expect(pathToTerminalFileHref("/tmp/a%0a.txt")).toBe("file:///tmp/a%250a.txt");
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
