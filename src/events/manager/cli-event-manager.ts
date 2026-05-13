import type { CellMetrics } from "../../renderer/dom/dom-renderer.js";
import type { TerminalEventRecord } from "../recording.js";
import type {
  Rect,
  TerminalBaseEvent,
  TerminalDebugNode,
  TerminalEventType,
  TerminalInputEvent,
  TerminalKeyboardEvent,
  TerminalNode,
  TerminalPointerEvent,
} from "./types.js";
import { appendFileSync } from "node:fs";
import process from "node:process";
import { getCliLatencyProfiler } from "../../observability/cli-latency-node.js";
import {
  SUPPRESS_TERMINAL_POINTER_DOWN,
  SUPPRESS_TERMINAL_POINTER_MOVE,
  SUPPRESS_TERMINAL_POINTER_UP,
} from "./selection-suppression.js";

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}

function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function area(rect: Rect): number {
  return Math.max(0, rect.w) * Math.max(0, rect.h);
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function isVisible(node: TerminalNode): boolean {
  return node.visible !== false;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

type RowRange = Readonly<{ y0: number; y1: number }>;

function rectRowRange(rect: Rect): RowRange | null {
  const y0 = Math.floor(rect.y);
  const y1 = Math.ceil(rect.y + rect.h) - 1;
  if (!Number.isFinite(y0) || !Number.isFinite(y1)) return null;
  if (y1 < y0) return null;
  return { y0, y1 };
}

export interface CliEventManager {
  register: (node: Omit<TerminalNode, "id"> & { id?: string }) => TerminalNode;
  update: (id: string, next: Partial<Omit<TerminalNode, "id">>) => void;
  unregister: (id: string) => void;
  setMetrics: (next: CellMetrics) => void;
  canSelectAt: (cellX: number, cellY: number) => boolean;
  autoScrollSelectionAt: (originCellX: number, originCellY: number, pointerCellY: number) => number;
  focus: (id: string | null) => void;
  getFocused: () => string | null;
  dispatch: (event: TerminalEventRecord) => boolean;
  debugNodes: () => TerminalDebugNode[];
  dispose: () => void;
}

let nextId = 0;

export function createCliEventManager(
  options?: Readonly<{
    record?: (event: TerminalEventRecord) => void;
    onFocusChange?: (prev: string | null, next: string | null) => void;
  }>,
): CliEventManager {
  const nodes = new Map<string, TerminalNode>();
  const rowBuckets = new Map<number, Set<string>>();
  const rowRangeById = new Map<string, RowRange>();
  let focusedId: string | null = null;
  let capturedId: string | null = null;
  let hoverPath: TerminalNode[] = [];
  const record = options?.record;
  const onFocusChange = options?.onFocusChange;
  const latency = getCliLatencyProfiler();

  const MODAL_FOCUS_Z_THRESHOLD = 100;
  const MODAL_ROOT_MIN_AREA = 40;

  function focusLockTarget(): { id: string; zIndex: number } | null {
    // Best-effort modal focus lock:
    // If a focusable overlay/dialog is present (zIndex >= threshold), prevent lower-zIndex
    // widgets (e.g. chat input) from stealing focus while the modal is open.
    // Prefer the highest zIndex modal root (large focusable region); fall back to
    // any focusable node above threshold when no large region is available.
    let bestRoot: { id: string; zIndex: number; area: number } | null = null;
    let bestAny: { id: string; zIndex: number; area: number } | null = null;
    for (const n of nodes.values()) {
      if (!n.focusable || !isVisible(n)) continue;
      const z = n.zIndex ?? 0;
      if (z < MODAL_FOCUS_Z_THRESHOLD) continue;
      const a = area(n.rect);
      if (!bestAny || z > bestAny.zIndex || (z === bestAny.zIndex && a > bestAny.area)) {
        bestAny = { id: n.id, zIndex: z, area: a };
      }
      if (
        a >= MODAL_ROOT_MIN_AREA &&
        (!bestRoot || z > bestRoot.zIndex || (z === bestRoot.zIndex && a > bestRoot.area))
      ) {
        bestRoot = { id: n.id, zIndex: z, area: a };
      }
    }
    const best = bestRoot ?? bestAny;
    return best ? { id: best.id, zIndex: best.zIndex } : null;
  }

  function resolveLockedFocusTarget(type?: TerminalEventType): TerminalNode | null {
    const lock = focusLockTarget();
    let target = focusedId ? (nodes.get(focusedId) ?? null) : null;

    const shouldRetarget =
      lock && (!target || !isVisible(target) || (target.zIndex ?? 0) < lock.zIndex);

    if (!shouldRetarget || !lock) return target;

    let best: TerminalNode | null = null;
    let bestScore = -Infinity;
    for (const node of nodes.values()) {
      if (!node.focusable || !isVisible(node)) continue;
      const z = node.zIndex ?? 0;
      if (z < lock.zIndex) continue;
      const handlers = node.handlers ?? {};
      const canHandle = type ? typeof (handlers as any)[type] === "function" : false;
      const a = area(node.rect);
      const score = z * 1_000_000_000 + (canHandle ? 1_000_000 : 0) - a;
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    if (best) {
      setFocus(best.id);
      target = best;
    }
    return target;
  }

  function removeFromRowBuckets(id: string): void {
    const prev = rowRangeById.get(id);
    if (!prev) return;
    for (let y = prev.y0; y <= prev.y1; y++) {
      const bucket = rowBuckets.get(y);
      if (!bucket) continue;
      bucket.delete(id);
      if (bucket.size === 0) rowBuckets.delete(y);
    }
    rowRangeById.delete(id);
  }

  function addToRowBuckets(id: string, node: TerminalNode): void {
    if (!isVisible(node)) return;
    const range = rectRowRange(node.rect);
    if (!range) return;
    rowRangeById.set(id, range);
    for (let y = range.y0; y <= range.y1; y++) {
      let bucket = rowBuckets.get(y);
      if (!bucket) {
        bucket = new Set();
        rowBuckets.set(y, bucket);
      }
      bucket.add(id);
    }
  }

  function updateRowBuckets(id: string, node: TerminalNode): void {
    if (!isVisible(node)) {
      removeFromRowBuckets(id);
      return;
    }
    const next = rectRowRange(node.rect);
    const prev = rowRangeById.get(id);
    if (!next) {
      removeFromRowBuckets(id);
      return;
    }
    if (prev && prev.y0 === next.y0 && prev.y1 === next.y1) return;
    removeFromRowBuckets(id);
    rowRangeById.set(id, next);
    for (let y = next.y0; y <= next.y1; y++) {
      let bucket = rowBuckets.get(y);
      if (!bucket) {
        bucket = new Set();
        rowBuckets.set(y, bucket);
      }
      bucket.add(id);
    }
  }

  function candidatesAt(cellX: number, cellY: number): TerminalNode[] {
    const list: TerminalNode[] = [];
    const bucket = rowBuckets.get(cellY);
    if (!bucket) return list;
    for (const id of bucket) {
      const node = nodes.get(id);
      if (!node) continue;
      if (!isVisible(node)) continue;
      if (contains(node.rect, cellX, cellY)) list.push(node);
    }
    // Outer -> inner.
    return list.sort((a, b) => area(b.rect) - area(a.rect) || a.zIndex - b.zIndex);
  }

  function pickTarget(list: TerminalNode[]): TerminalNode | null {
    if (list.length === 0) return null;
    let target: TerminalNode = list[0]!;
    for (const n of list) {
      if (n.zIndex > target.zIndex) target = n;
      else if (n.zIndex === target.zIndex && area(n.rect) <= area(target.rect)) target = n;
    }
    return target;
  }

  function pathOuterToInner(list: TerminalNode[], target: TerminalNode | null): TerminalNode[] {
    if (!target) return [];
    const filtered = list.filter(
      (n) =>
        n.id !== target.id &&
        (!n.focusable ||
          !target.focusable ||
          n.zIndex !== target.zIndex ||
          !sameRect(n.rect, target.rect)),
    );
    return [...filtered, target];
  }

  function ancestorsForTarget(target: TerminalNode): TerminalNode[] {
    const range = rectRowRange(target.rect);
    const seedBucket = range ? rowBuckets.get(range.y0) : null;
    if (!seedBucket) {
      const list: TerminalNode[] = [];
      for (const node of nodes.values()) {
        if (!isVisible(node)) continue;
        if (containsRect(node.rect, target.rect)) list.push(node);
      }
      const sorted = list.sort((a, b) => area(b.rect) - area(a.rect) || a.zIndex - b.zIndex);
      return pathOuterToInner(sorted, target);
    }

    const list: TerminalNode[] = [];
    for (const id of seedBucket) {
      const node = nodes.get(id);
      if (!node) continue;
      if (!isVisible(node)) continue;
      if (containsRect(node.rect, target.rect)) list.push(node);
    }
    const sorted = list.sort((a, b) => area(b.rect) - area(a.rect) || a.zIndex - b.zIndex);
    return pathOuterToInner(sorted, target);
  }

  function makeBaseEvent(
    type: TerminalEventType,
    path: TerminalNode[],
    time?: number,
  ): TerminalBaseEvent & { __stopped: boolean } {
    return {
      type,
      target: null,
      currentTarget: null,
      eventPhase: 2 as 1 | 2 | 3,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      timeStamp: typeof time === "number" ? time : now(),
      __stopped: false,
      stopPropagation() {
        this.__stopped = true;
      },
      preventDefault() {
        this.defaultPrevented = true;
      },
      composedPath() {
        return [...path].reverse();
      },
    };
  }

  function dispatchToNode(
    handlerKey: string,
    node: TerminalNode | null,
    event: TerminalBaseEvent & { __stopped: boolean },
  ): void {
    event.currentTarget = node;
    if (!node) return;

    const handler = (node.handlers as any)[handlerKey] as ((e: any) => void) | undefined;
    if (handler) {
      try {
        handler(event as any);
      } catch (err) {
        // Log handler error but don't crash
        try {
          const env = process?.env;
          if (env?.DIMCODE_DEBUG === "1") {
            const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
            appendFileSync(
              "/tmp/goatchain-debug.log",
              `[${timestamp}] [EVENT-MGR] ERROR in handler ${node.id}.${handlerKey}: ${err}\n`,
            );
          }
        } catch {
          // Ignore
        }
      }
    }
  }

  function dispatchWithPhases(
    type: TerminalEventType,
    path: TerminalNode[],
    target: TerminalNode | null,
    event: TerminalBaseEvent & { __stopped: boolean },
  ): void {
    event.target = target;

    const captureKey = `${type}Capture`;
    // Capture: outer -> inner (includes target).
    event.eventPhase = 1;
    for (const node of path) {
      dispatchToNode(captureKey, node, event);
      if (event.__stopped) return;
    }

    // Target.
    if (target) {
      event.eventPhase = 2;
      dispatchToNode(type, target, event);
      if (event.__stopped) return;
    }

    if (!event.bubbles) return;

    // Bubble: inner parent -> outer (exclude target).
    event.eventPhase = 3;
    for (let i = path.length - 2; i >= 0; i--) {
      dispatchToNode(type, path[i]!, event);
      if (event.__stopped) return;
    }
  }

  function sharedPrefixLenById(a: TerminalNode[], b: TerminalNode[]): number {
    const min = Math.min(a.length, b.length);
    let i = 0;
    for (; i < min; i++) {
      if (a[i]!.id !== b[i]!.id) break;
    }
    return i;
  }

  function updateHover(nextTarget: TerminalNode | null, record: PointerLikeRecord): void {
    const nextPath = nextTarget ? ancestorsForTarget(nextTarget) : [];
    const shared = sharedPrefixLenById(hoverPath, nextPath);

    for (let i = hoverPath.length - 1; i >= shared; i--) {
      const target = hoverPath[i] ?? null;
      if (!target) continue;
      const path = hoverPath.slice(0, i + 1);
      const ev = buildPointerEvent("pointerleave", path, record);
      ev.bubbles = false;
      dispatchWithPhases("pointerleave", path, target, ev);
    }

    for (let i = shared; i < nextPath.length; i++) {
      const target = nextPath[i] ?? null;
      if (!target) continue;
      const path = nextPath.slice(0, i + 1);
      const ev = buildPointerEvent("pointerenter", path, record);
      ev.bubbles = false;
      dispatchWithPhases("pointerenter", path, target, ev);
    }

    hoverPath = nextPath;
  }

  function setFocus(nextId: string | null): void {
    const lock = focusLockTarget();
    if (lock) {
      if (!nextId) {
        // Avoid losing focus while a modal is open; keep focus inside the modal layer.
        nextId = lock.id;
      } else {
        const want = nodes.get(nextId) ?? null;
        const wantZ = want?.zIndex ?? 0;
        if (want && isVisible(want) && wantZ < lock.zIndex) {
          // Deny focusing controls behind the modal.
          return;
        }
      }
    }

    if (focusedId === nextId) return;
    const prev = focusedId ? (nodes.get(focusedId) ?? null) : null;
    const nextRaw = nextId ? (nodes.get(nextId) ?? null) : null;
    const next = nextRaw && isVisible(nextRaw) ? nextRaw : null;
    focusedId = next?.id ?? null;
    onFocusChange?.(prev?.id ?? null, focusedId);

    if (prev) {
      const path = ancestorsForTarget(prev);
      const ev = makeBaseEvent("blur", path);
      dispatchWithPhases("blur", path, prev, ev);
    }
    if (next) {
      const path = ancestorsForTarget(next);
      const ev = makeBaseEvent("focus", path);
      dispatchWithPhases("focus", path, next, ev);
    }
  }

  type PointerRecord = Extract<
    TerminalEventRecord,
    {
      type: "pointerdown" | "pointerup" | "pointermove" | "click" | "dblclick" | "contextmenu";
    }
  >;
  type WheelRecord = Extract<TerminalEventRecord, { type: "wheel" }>;
  type PointerLikeRecord = PointerRecord | WheelRecord;

  function buildPointerEvent(
    type: TerminalEventType,
    path: TerminalNode[],
    record: PointerLikeRecord,
  ): TerminalPointerEvent & { __stopped: boolean } {
    const base = makeBaseEvent(type, path, record.time);
    return Object.assign(base, {
      clientX: record.clientX ?? record.cellX,
      clientY: record.clientY ?? record.cellY,
      cellX: record.cellX,
      cellY: record.cellY,
      button: record.type === "wheel" ? undefined : record.button,
      buttons: record.type === "wheel" ? undefined : record.buttons,
      ctrlKey: record.ctrlKey,
      shiftKey: record.shiftKey,
      altKey: record.altKey,
      metaKey: record.metaKey,
      deltaY: record.type === "wheel" ? record.deltaY : undefined,
      deltaMode: record.type === "wheel" ? record.deltaMode : undefined,
    });
  }

  function keyCombo(native: Extract<TerminalEventRecord, { type: "keydown" | "keyup" }>): string {
    let out = "";
    if (native.metaKey) out += "Meta+";
    if (native.ctrlKey) out += "Ctrl+";
    if (native.altKey) out += "Alt+";
    if (native.shiftKey) out += "Shift+";
    out += native.key;
    return out;
  }

  function buildKeyboardEvent(
    type: TerminalEventType,
    path: TerminalNode[],
    record: Extract<TerminalEventRecord, { type: "keydown" | "keyup" }>,
  ): TerminalKeyboardEvent & { __stopped: boolean } {
    const base = makeBaseEvent(type, path, record.time);
    return Object.assign(base, {
      key: record.key,
      code: record.code ?? "",
      combo: keyCombo(record),
      ctrlKey: record.ctrlKey,
      shiftKey: record.shiftKey,
      altKey: record.altKey,
      metaKey: record.metaKey,
      repeat: record.repeat,
    });
  }

  function buildInputEvent(
    type: TerminalEventType,
    path: TerminalNode[],
    record: Extract<
      TerminalEventRecord,
      {
        type:
          | "beforeinput"
          | "input"
          | "compositionstart"
          | "compositionupdate"
          | "compositionend"
          | "paste";
      }
    >,
  ): TerminalInputEvent & { __stopped: boolean } {
    const base = makeBaseEvent(type, path, record.time);
    return Object.assign(base, {
      data: record.data,
      inputType: record.inputType,
      isComposing: record.isComposing,
      text: record.text,
    });
  }

  function dispatchPointerEvent(
    type: TerminalEventType,
    record: PointerLikeRecord,
    targetOverride?: TerminalNode | null,
  ): boolean {
    const list = candidatesAt(record.cellX, record.cellY);
    const target = targetOverride ?? pickTarget(list);
    const path = target ? pathOuterToInner(list, target) : [];
    const ev = buildPointerEvent(type, path, record);
    dispatchWithPhases(type, path, target, ev);
    return ev.defaultPrevented;
  }

  function dispatchToFocused(
    type: TerminalEventType,
    record: Extract<TerminalEventRecord, { type: "keydown" | "keyup" }>,
  ): boolean {
    const target = resolveLockedFocusTarget(type);
    const path = target ? ancestorsForTarget(target) : [];
    const ev = buildKeyboardEvent(type, path, record);
    dispatchWithPhases(type, path, target, ev);
    return ev.defaultPrevented;
  }

  function dispatchToFocusedText(
    type: TerminalEventType,
    record: Extract<
      TerminalEventRecord,
      {
        type:
          | "beforeinput"
          | "input"
          | "compositionstart"
          | "compositionupdate"
          | "compositionend"
          | "paste";
      }
    >,
  ): boolean {
    const target = resolveLockedFocusTarget(type);

    const path = target ? [target] : [];
    const ev = buildInputEvent(type, path, record);
    dispatchWithPhases(type, path, target, ev);
    return ev.defaultPrevented;
  }

  return {
    register(node) {
      const id = node.id ?? `n${nextId++}`;
      const focusable = node.focusable;
      const full: TerminalNode = {
        id,
        rect: node.rect,
        zIndex: node.zIndex ?? 0,
        visible: node.visible ?? true,
        focusable,
        selectable: node.selectable ?? !focusable,
        selectionScrollBy: node.selectionScrollBy,
        handlers: node.handlers ?? {},
      };
      if (nodes.has(id)) removeFromRowBuckets(id);
      nodes.set(id, full);
      addToRowBuckets(id, full);
      return full;
    },
    update(id, next) {
      const prev = nodes.get(id);
      if (!prev) return;
      const nextVisible = next.visible ?? prev.visible;
      if (nextVisible === false) {
        if (focusedId === id) setFocus(null);
        if (capturedId === id) capturedId = null;
        if (hoverPath.some((n) => n.id === id)) hoverPath = [];
      }
      nodes.set(id, {
        ...prev,
        ...next,
        rect: next.rect ?? prev.rect,
        zIndex: next.zIndex ?? prev.zIndex,
        visible: nextVisible,
        handlers: next.handlers ?? prev.handlers,
      });
      const updated = nodes.get(id);
      if (updated) updateRowBuckets(id, updated);
    },
    unregister(id) {
      if (capturedId === id) capturedId = null;
      if (hoverPath.some((n) => n.id === id)) hoverPath = [];
      removeFromRowBuckets(id);
      nodes.delete(id);
      if (focusedId === id) setFocus(null);
    },
    setMetrics(_next) {
      // no-op for CLI
    },
    canSelectAt(cellX, cellY) {
      const list = candidatesAt(cellX, cellY);
      const target = pickTarget(list);
      return target ? Boolean(target.selectable) : true;
    },
    autoScrollSelectionAt(originCellX, originCellY, pointerCellY) {
      const target = pickTarget(candidatesAt(originCellX, originCellY));
      if (!target) return 0;
      const path = ancestorsForTarget(target);
      let owner: TerminalNode | null = null;
      for (let i = path.length - 1; i >= 0; i--) {
        const node = path[i]!;
        if (typeof node.selectionScrollBy === "function") {
          owner = node;
          break;
        }
      }
      if (!owner) return 0;
      const rect = owner.rect;
      const y = Math.floor(pointerCellY);
      let delta = 0;
      if (y <= rect.y) delta = -1;
      else if (y >= rect.y + rect.h - 1) delta = 1;
      if (!delta) return 0;
      const scrolled = owner.selectionScrollBy?.(delta);
      return scrolled === false ? 0 : delta;
    },
    focus(id) {
      setFocus(id);
    },
    getFocused() {
      return focusedId;
    },
    dispatch(event) {
      record?.(event);
      latency?.recordEventDispatchStart(event);
      let prevented = false;
      try {
        if (event.type === "keydown" || event.type === "keyup") {
          prevented = dispatchToFocused(event.type, event);
          return prevented;
        }
        if (
          event.type === "pointerdown" ||
          event.type === "pointermove" ||
          event.type === "pointerup" ||
          event.type === "click" ||
          event.type === "dblclick" ||
          event.type === "contextmenu" ||
          event.type === "wheel"
        ) {
          if (event.type === "pointerdown") {
            const list = candidatesAt(event.cellX, event.cellY);
            const target = pickTarget(list);
            // When selection owns the gesture, still resolve focus/capture
            // for parity with the DOM event manager's suppressed path,
            // but skip dispatching the pointerdown event to the node.
            if ((event as any)[SUPPRESS_TERMINAL_POINTER_DOWN]) {
              if (target?.focusable) setFocus(target.id);
              capturedId = target?.id ?? null;
              updateHover(target, event);
              return true;
            }
            if (target?.focusable) setFocus(target.id);
            capturedId = target?.id ?? null;
            updateHover(target, event);
            prevented = dispatchPointerEvent("pointerdown", event, target);
            return prevented;
          }

          if (event.type === "pointermove" && capturedId) {
            if ((event as any)[SUPPRESS_TERMINAL_POINTER_MOVE]) {
              const target = nodes.get(capturedId) ?? null;
              if (target) updateHover(target, event);
              return true;
            }
            const target = nodes.get(capturedId) ?? null;
            if (!target) return prevented;
            updateHover(target, event);
            const path = ancestorsForTarget(target);
            const ev = buildPointerEvent("pointermove", path, event);
            dispatchWithPhases("pointermove", path, target, ev);
            prevented = ev.defaultPrevented;
            return prevented;
          }

          if (event.type === "pointermove") {
            if ((event as any)[SUPPRESS_TERMINAL_POINTER_MOVE]) {
              return true;
            }
            const list = candidatesAt(event.cellX, event.cellY);
            const target = pickTarget(list);
            updateHover(target, event);
            prevented = dispatchPointerEvent("pointermove", event, target);
            return prevented;
          }

          if (event.type === "pointerup" && capturedId) {
            if ((event as any)[SUPPRESS_TERMINAL_POINTER_UP]) {
              capturedId = null;
              return true;
            }
            const target = nodes.get(capturedId) ?? null;
            const path = target ? ancestorsForTarget(target) : [];
            const ev = buildPointerEvent("pointerup", path, event);
            dispatchWithPhases("pointerup", path, target, ev);
            capturedId = null;
            prevented = ev.defaultPrevented;
            return prevented;
          }

          if (event.type === "pointerup") {
            if ((event as any)[SUPPRESS_TERMINAL_POINTER_UP]) {
              capturedId = null;
              return true;
            }
            prevented = dispatchPointerEvent("pointerup", event);
            capturedId = null;
            return prevented;
          }

          prevented = dispatchPointerEvent(event.type as TerminalEventType, event);
          return prevented;
        }

        if (
          event.type === "beforeinput" ||
          event.type === "input" ||
          event.type === "compositionstart" ||
          event.type === "compositionupdate" ||
          event.type === "compositionend" ||
          event.type === "paste"
        ) {
          prevented = dispatchToFocusedText(event.type, event);
          return prevented;
        }
        return prevented;
      } finally {
        latency?.recordEventDispatchEnd(event, { defaultPrevented: prevented });
      }
    },
    debugNodes() {
      return Array.from(nodes.values()).map((n) => ({
        id: n.id,
        rect: n.rect,
        zIndex: n.zIndex,
        visible: isVisible(n),
        focusable: Boolean(n.focusable),
      }));
    },
    dispose() {
      rowBuckets.clear();
      rowRangeById.clear();
      nodes.clear();
      focusedId = null;
      capturedId = null;
      hoverPath = [];
    },
  };
}
