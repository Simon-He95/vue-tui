import type { CliEventManager } from "../../src/cli.js";

export type WheelBurstOptions = Readonly<{
  count: number;
  cellX?: number;
  cellY?: number;
  deltaY?: number;
  deltaMode?: number;
  startTime?: number;
  stepMs?: number;
}>;

export function dispatchWheelBurst(
  events: Pick<CliEventManager, "dispatch">,
  options: WheelBurstOptions,
): boolean[] {
  const {
    count,
    cellX = 0,
    cellY = 0,
    deltaY = 100,
    deltaMode,
    startTime = 1_000,
    stepMs = 10,
  } = options;
  const prevented: boolean[] = [];

  for (let i = 0; i < count; i++) {
    prevented.push(
      events.dispatch({
        type: "wheel",
        cellX,
        cellY,
        deltaY,
        deltaMode,
        time: startTime + i * stepMs,
      }),
    );
  }

  return prevented;
}
