import { describe, expect, it } from "vitest";
import { applyWheelScroll, createWheelScrollState } from "../src/vue/utils/wheel-scroll.js";

describe("wheel scroll", () => {
  it("keeps line-unit wheel deltas unchanged", () => {
    const state = createWheelScrollState();
    const result = applyWheelScroll(state, 3, 10, 100, 1000);

    expect(result.lines).toBe(3);
    expect(result.nextTop).toBe(13);
  });

  it("normalizes large pixel wheel gestures by a conservative line height", () => {
    const state = createWheelScrollState();
    const result = applyWheelScroll(state, 1200, 10, 1000, 1000);

    expect(result.lines).toBe(75);
    expect(result.nextTop).toBe(85);
  });

  it("accelerates rapid pixel wheel gestures more aggressively", () => {
    const state = createWheelScrollState();
    const first = applyWheelScroll(state, 240, 10, 5000, 1000);
    const second = applyWheelScroll(state, 240, first.nextTop, 5000, 1010);

    expect(first.lines).toBe(15);
    expect(second.lines).toBe(358);
    expect(second.nextTop).toBe(383);
  });

  it("can skip rapid pixel acceleration for synthetic easing ticks", () => {
    const state = createWheelScrollState();
    const first = applyWheelScroll(state, 240, 10, 5000, 1000, "auto", {
      disableAcceleration: true,
    });
    const second = applyWheelScroll(state, 240, first.nextTop, 5000, 1010, "auto", {
      disableAcceleration: true,
    });

    expect(first.lines).toBe(15);
    expect(second.lines).toBe(15);
    expect(second.nextTop).toBe(40);
  });
});
