import { describe, expect, it, vi } from "vitest";
import { layoutMarkdownBlocks } from "../src/vue/markdown/layout.js";
import { createTuiMarkdownParser, type TuiMarkdownParser } from "../src/vue/markdown/parser.js";
import { createMarkdownBlockSource } from "../src/markdown.js";

describe("markdown block source", () => {
  it("parses only the active tail while finalized blocks stay reusable", () => {
    const realParser = createTuiMarkdownParser({ streaming: true });
    const parser: TuiMarkdownParser = {
      parse: vi.fn((content, final) => realParser.parse(content, final)),
    };
    const source = createMarkdownBlockSource({ parser });

    source.appendDelta("### Plan\n\n- inspect\n");
    source.snapshot();
    source.finalizeBlock();
    const finalizedCalls = vi.mocked(parser.parse).mock.calls.length;

    source.appendDelta("streaming");
    source.appendDelta(" tail");
    const snapshot = source.snapshot();
    const repeated = source.snapshot();

    expect(snapshot.blocks).toBe(repeated.blocks);
    expect(vi.mocked(parser.parse).mock.calls).toHaveLength(finalizedCalls + 1);
    expect(vi.mocked(parser.parse).mock.calls.at(-1)).toEqual(["streaming tail", false]);
    expect(layoutMarkdownBlocks(snapshot.blocks, 32).map((row) => row.plainText)).toContain(
      "streaming tail",
    );
  });

  it("replaces the streaming tail without reparsing finalized blocks", () => {
    const realParser = createTuiMarkdownParser({ streaming: true });
    const parser: TuiMarkdownParser = {
      parse: vi.fn((content, final) => realParser.parse(content, final)),
    };
    const source = createMarkdownBlockSource({ parser });

    source.appendDelta("done");
    source.finalizeBlock();
    const finalizedCalls = vi.mocked(parser.parse).mock.calls.length;

    source.replaceTailBlock("first tail");
    source.snapshot();
    source.replaceTailBlock("second tail");
    const snapshot = source.snapshot();

    expect(vi.mocked(parser.parse).mock.calls).toHaveLength(finalizedCalls + 2);
    expect(vi.mocked(parser.parse).mock.calls.at(-1)).toEqual(["second tail", false]);
    expect(layoutMarkdownBlocks(snapshot.blocks, 32).map((row) => row.plainText)).toContain(
      "second tail",
    );
  });
});
