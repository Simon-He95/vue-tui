import { describe, expect, it } from "vitest";
import {
  createTLogOsc8LinkPlugin,
  detectTLogUrls,
  parseTLogAnnotatedText,
  sanitizeTerminalHref,
} from "../src/experimental.js";

describe("TLog link sanitizing", () => {
  it("exports the shared terminal href sanitizer", () => {
    expect(sanitizeTerminalHref(" https://example.com ")).toBe("https://example.com");
    expect(sanitizeTerminalHref("file:///tmp/a")).toBeNull();
    expect(sanitizeTerminalHref("file:///tmp/a", { allowFileUrls: true })).toBe("file:///tmp/a");
    expect(sanitizeTerminalHref("docs/intro.md")).toBeNull();
    expect(sanitizeTerminalHref("foo:bar")).toBeNull();
    expect(sanitizeTerminalHref("https:example.com")).toBeNull();
    expect(sanitizeTerminalHref("http:\\example.com")).toBeNull();
  });

  it("drops unsafe OSC8 links while preserving visible text", () => {
    const parsed = parseTLogAnnotatedText(
      "\x1b]8;;javascript:alert(1)\x07bad\x1b]8;;\x07 " +
        "\x1b]8;;https://safe.example\x07safe\x1b]8;;\x07",
    );

    expect(parsed.plainText).toBe("bad safe");
    expect(parsed.osc8Links).toEqual([
      {
        href: "https://safe.example",
        text: "safe",
        startCell: 4,
        endCell: 8,
      },
    ]);
  });

  it("sanitizes OSC8 plugin metadata", () => {
    const plugin = createTLogOsc8LinkPlugin();
    const metadata = plugin.parseLine?.({
      lineIndex: 0,
      absoluteLineIndex: 10,
      lineKey: "line",
      text: "",
      plainText: "bad safe",
      osc8Links: [
        {
          href: "javascript:alert(1)",
          text: "bad",
          startCell: 0,
          endCell: 3,
        },
        {
          href: "https://safe.example",
          text: "safe",
          startCell: 4,
          endCell: 8,
        },
      ],
    });

    expect(metadata).toEqual({
      externalLinks: [
        {
          id: "osc8:10:1:https://safe.example",
          href: "https://safe.example",
          text: "safe",
          startCell: 4,
          endCell: 8,
          source: "osc8",
        },
      ],
    });
  });

  it("detects only safe URL schemes by default", () => {
    const links = detectTLogUrls(
      "https://example.com mailto:test@example.com file:///tmp/a javascript:alert(1)",
    );

    expect(links.map((link) => link.href)).toEqual([
      "https://example.com",
      "mailto:test@example.com",
    ]);
  });

  it("detects file URLs only when explicitly enabled", () => {
    const links = detectTLogUrls("file:///tmp/a https://example.com", { allowFileUrls: true });

    expect(links.map((link) => link.href)).toEqual(["file:///tmp/a", "https://example.com"]);
  });
});
