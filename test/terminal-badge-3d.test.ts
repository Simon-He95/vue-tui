import type { T3DViewportMotion } from "../src/experimental.js";
import { describe, expect, it } from "vitest";
import {
  pickTerminalBadgeContributor,
  terminalBadgeContributorRadiusScales,
} from "../src/experimental/3d/bun/terminal-badge-scene.js";

const idleMotion: T3DViewportMotion = {
  yaw: 0,
  pitch: 0,
  yawVelocity: 0,
  pitchVelocity: 0,
  pointerX: 0,
  pointerY: 0,
  pointerSpeed: 0,
  hovering: false,
  zoom: 1,
  zoomVelocity: 0,
  hoveredObjectId: null,
  selectedObjectId: null,
};

describe("terminal badge contributors", () => {
  it("keeps the founder radius at 1.6x and all other contributor radii unchanged", () => {
    expect(terminalBadgeContributorRadiusScales).toHaveLength(100);
    expect(terminalBadgeContributorRadiusScales[0]).toBe(1.6);
    expect(terminalBadgeContributorRadiusScales.slice(1).every((scale) => scale === 1)).toBe(true);
  });

  it("picks the founder across the enlarged visual radius", () => {
    const hit = pickTerminalBadgeContributor({
      pointerX: 0,
      pointerY: -0.58,
      pixelWidth: 480,
      pixelHeight: 288,
      cellWidth: 1_000,
      cellHeight: 1_000,
      motion: idleMotion,
    });

    expect(hit).toEqual({
      objectId: 0,
      label: "yyx990803",
      href: "https://github.com/yyx990803",
    });
  });
});
