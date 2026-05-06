export type ScrollTopChange = Readonly<{
  changed: boolean;
  dirty: boolean;
  top: number;
}>;

export type ActiveChange = Readonly<{
  changedActive: boolean;
  changedScroll: boolean;
  dirty: boolean;
  next: number;
}>;

export type SyncModelResult = Readonly<{
  canceledPendingWheel: boolean;
  reattached: boolean;
  changedActive: boolean;
  changedScroll: boolean;
  dirty: boolean;
}>;

export function getWheelScrollInput(e: { deltaY?: number; deltaMode?: number }): {
  deltaY: number;
  mode: "auto" | "line" | "pixel";
} {
  const deltaY = Number(e.deltaY ?? 0);
  const deltaMode = typeof e.deltaMode === "number" ? e.deltaMode : undefined;
  if (
    Number.isInteger(deltaY) &&
    deltaY !== 0 &&
    Math.abs(deltaY) >= 100 &&
    Math.abs(deltaY) % 100 === 0 &&
    deltaMode == null
  ) {
    return { deltaY: deltaY / 100, mode: "line" };
  }
  if (deltaMode === 1) return { deltaY, mode: "line" };
  if (deltaMode === 0) return { deltaY, mode: "pixel" };
  return { deltaY, mode: "auto" };
}
