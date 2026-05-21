import { describe, expect, it } from "vitest";
import { resolveTUserMessageViewModel } from "../src/agent.js";

describe("agent view models", () => {
  it("wraps user messages without splitting complex emoji graphemes", () => {
    const coder = "\u{1F468}\u{1F3FD}\u200D\u{1F4BB}";
    const pirateFlag = "\u{1F3F4}\u200D\u2620\uFE0F";
    const keycapOne = "1\uFE0F\u20E3";
    const content = `a${coder}${pirateFlag}${keycapOne}b`;
    const coderStart = 1;
    const coderEnd = coderStart + coder.length;

    const viewModel = resolveTUserMessageViewModel({
      w: 2,
      label: "You",
      content,
      segments: [{ start: coderStart, end: coderEnd, style: { bold: true } }],
    });

    expect(viewModel.rows.map((row) => row.text)).toEqual(["a", coder, pirateFlag, keycapOne, "b"]);
    expect(viewModel.rows[1]?.start).toBe(coderStart);
    expect(viewModel.rows[1]?.end).toBe(coderEnd);
    expect(viewModel.rows[1]?.segments).toEqual([
      { start: coderStart, end: coderEnd, style: { bold: true } },
    ]);
  });

  it("wraps user messages without splitting combining mark graphemes", () => {
    const eAcute = "e\u0301";
    const viewModel = resolveTUserMessageViewModel({
      w: 1,
      label: "You",
      content: `a${eAcute}b`,
    });

    expect(viewModel.rows.map((row) => row.text)).toEqual(["a", eAcute, "b"]);
  });
});
