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

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}

function isVisible(node: TerminalNode): boolean {
  return node.visible !== false;
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

export interface EventManager {
  register: (node: Omit<TerminalNode, "id"> & { id?: string }) => TerminalNode;
  update: (id: string, next: Partial<Omit<TerminalNode, "id">>) => void;
  unregister: (id: string) => void;
  setMetrics: (next: CellMetrics) => void;
  canSelectAt: (cellX: number, cellY: number) => boolean;
  autoScrollSelectionAt: (originCellX: number, originCellY: number, pointerCellY: number) => number;
  focus: (id: string | null) => void;
  getFocused: () => string | null;
  debugNodes: () => TerminalDebugNode[];
  dispose: () => void;
}

let nextId = 0;

export function createEventManager(
  container: HTMLElement,
  metrics: CellMetrics,
  options?: Readonly<{
    record?: (event: TerminalEventRecord) => void;
    textInputTarget?: HTMLElement | null;
    debugIme?: boolean;
    onFocusChange?: (prev: string | null, next: string | null) => void;
  }>,
): EventManager {
  let currentMetrics = metrics;
  const nodes = new Map<string, TerminalNode>();
  const rowBuckets = new Map<number, Set<string>>();
  const rowRangeById = new Map<string, RowRange>();
  let focusedId: string | null = null;
  let capturedId: string | null = null;
  let hoverPath: TerminalNode[] = [];
  let lastPointerMoveEvent: MouseEvent | PointerEvent | null = null;
  const rawRecord = options?.record;
  const recordStart = now();
  const record = rawRecord
    ? (event: TerminalEventRecord) => {
        rawRecord({ ...event, time: now() - recordStart });
      }
    : undefined;
  const onFocusChange = options?.onFocusChange;
  const textInputTarget = options?.textInputTarget ?? null;

  const MODAL_FOCUS_Z_THRESHOLD = 100;
  const MODAL_ROOT_MIN_AREA = 40;

  function focusLockTarget(): { id: string; zIndex: number } | null {
    // Prevent background widgets (e.g. bottom TInput) from stealing focus while a modal/overlay
    // is open. Prefer the highest zIndex modal root (large focusable region); fall back to
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

  function resolveModalLockNode(): TerminalNode | null {
    const lock = focusLockTarget();
    if (!lock) return null;
    const node = nodes.get(lock.id) ?? null;
    return node && isVisible(node) ? node : null;
  }

  function isAllowedModalPointerNode(
    node: TerminalNode,
    target: TerminalNode,
    lockNode: TerminalNode,
  ): boolean {
    const nodeZ = node.zIndex ?? 0;
    const targetZ = target.zIndex ?? 0;
    const lockZ = lockNode.zIndex ?? 0;
    if (nodeZ >= lockZ) return true;
    return targetZ < lockZ && nodeZ >= targetZ && containsRect(node.rect, lockNode.rect);
  }
  const shouldDebugIme = () =>
    Boolean((options as any)?.debugIme) || Boolean((globalThis as any).__VT_DEBUG_IME__);
  const imeLog = (msg: string, extra?: Record<string, unknown>) => {
    if (!shouldDebugIme()) return;
    // eslint-disable-next-line no-console
    console.debug(`[vue-terminal][ime] ${msg}`, extra ?? {});
  };

  // Tracks DOM IME composing state so we can avoid stealing keys (Enter/Arrows) from IME candidate selection.
  let domComposing = false;

  const defaultUserSelect = container.style.userSelect || "text";
  if (!container.hasAttribute("tabindex")) container.tabIndex = 0;
  if (!container.style.userSelect) container.style.userSelect = defaultUserSelect;

  let containerRect: DOMRect | null = null;
  let containerRectDirty = true;
  function markContainerRectDirty(): void {
    containerRectDirty = true;
  }
  function getContainerRect(): DOMRect {
    if (!containerRect || containerRectDirty) {
      containerRect = container.getBoundingClientRect();
      containerRectDirty = false;
    }
    return containerRect;
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
      const sorted = list.sort((a, b) => a.zIndex - b.zIndex || area(b.rect) - area(a.rect));
      return pathOuterToInner(sorted, target);
    }

    const list: TerminalNode[] = [];
    for (const id of seedBucket) {
      const node = nodes.get(id);
      if (!node) continue;
      if (!isVisible(node)) continue;
      if (containsRect(node.rect, target.rect)) list.push(node);
    }
    // Order containment path using stacking first, then geometry.
    // This prevents "click-through" where a lower zIndex hitbox behind a modal/dialog
    // is treated as a closer ancestor (because it's smaller) and receives bubble events
    // before the modal can stopPropagation().
    const sorted = list.sort((a, b) => a.zIndex - b.zIndex || area(b.rect) - area(a.rect));
    return pathOuterToInner(sorted, target);
  }

  function makeBaseEvent(
    type: TerminalEventType,
    path: TerminalNode[],
    nativeEvent?: Event,
  ): TerminalBaseEvent & { __stopped: boolean } {
    const e = {
      type,
      target: null,
      currentTarget: null,
      eventPhase: 2 as 1 | 2 | 3,
      bubbles: true,
      cancelable: true,
      defaultPrevented: false,
      timeStamp: now(),
      __stopped: false,
      stopPropagation() {
        this.__stopped = true;
      },
      preventDefault() {
        this.defaultPrevented = true;
        nativeEvent?.preventDefault?.();
      },
      composedPath() {
        return [...path].reverse();
      },
      nativeEvent,
    };
    return e;
  }

  function dispatchToNode(
    handlerKey: string,
    node: TerminalNode | null,
    event: TerminalBaseEvent & { __stopped: boolean },
  ): void {
    event.currentTarget = node;
    if (!node) return;
    const handler = (node.handlers as any)[handlerKey] as ((e: any) => void) | undefined;
    handler?.(event as any);
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

  function updateHover(nextTarget: TerminalNode | null, native: MouseEvent | PointerEvent): void {
    const nextPath = nextTarget ? ancestorsForTarget(nextTarget) : [];
    const shared = sharedPrefixLenById(hoverPath, nextPath);

    // Leave: inner -> outer.
    for (let i = hoverPath.length - 1; i >= shared; i--) {
      const target = hoverPath[i] ?? null;
      if (!target) continue;
      const path = hoverPath.slice(0, i + 1);
      const ev = buildPointerEvent("pointerleave", path, native as any);
      ev.bubbles = false;
      dispatchWithPhases("pointerleave", path, target, ev);
    }

    // Enter: outer -> inner.
    for (let i = shared; i < nextPath.length; i++) {
      const target = nextPath[i] ?? null;
      if (!target) continue;
      const path = nextPath.slice(0, i + 1);
      const ev = buildPointerEvent("pointerenter", path, native as any);
      ev.bubbles = false;
      dispatchWithPhases("pointerenter", path, target, ev);
    }

    hoverPath = nextPath;
  }

  function setFocus(nextId: string | null): void {
    const lock = focusLockTarget();
    if (lock) {
      if (!nextId) {
        // Avoid losing focus while a modal is open; keep focus within the modal layer.
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

  function toCell(clientX: number, clientY: number): { cellX: number; cellY: number } {
    const rect = getContainerRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return {
      cellX: Math.max(0, Math.floor(x / currentMetrics.cellWidth)),
      cellY: Math.max(0, Math.floor(y / currentMetrics.cellHeight)),
    };
  }

  function buildPointerEvent(
    type: TerminalEventType,
    path: TerminalNode[],
    native: MouseEvent | PointerEvent | WheelEvent,
  ): TerminalPointerEvent & { __stopped: boolean } {
    const base = makeBaseEvent(type, path, native);
    const { cellX, cellY } = toCell(native.clientX, native.clientY);
    return Object.assign(base, {
      clientX: native.clientX,
      clientY: native.clientY,
      cellX,
      cellY,
      button: "button" in native ? native.button : undefined,
      buttons: "buttons" in native ? native.buttons : undefined,
      ctrlKey: native.ctrlKey,
      shiftKey: native.shiftKey,
      altKey: native.altKey,
      metaKey: native.metaKey,
      deltaY: "deltaY" in native ? native.deltaY : undefined,
      deltaMode: "deltaMode" in native ? native.deltaMode : undefined,
    });
  }

  function keyCombo(native: KeyboardEvent): string {
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
    native: KeyboardEvent,
  ): TerminalKeyboardEvent & { __stopped: boolean } {
    const base = makeBaseEvent(type, path, native);
    return Object.assign(base, {
      key: native.key,
      code: native.code,
      combo: keyCombo(native),
      ctrlKey: native.ctrlKey,
      shiftKey: native.shiftKey,
      altKey: native.altKey,
      metaKey: native.metaKey,
      repeat: native.repeat,
    });
  }

  function dispatchPointer(
    type: TerminalEventType,
    native: MouseEvent | PointerEvent | WheelEvent,
    targetOverride?: TerminalNode | null,
  ): void {
    const { cellX, cellY } = toCell(native.clientX, native.clientY);
    const list = candidatesAt(cellX, cellY);
    const target = targetOverride ?? pickTarget(list);

    // Block pointer events to elements below an active modal/dialog.
    // Without this, clicks outside a dialog's bounds fall through to
    // lower-zIndex background elements (the "click-through" bug), while
    // still allowing the dialog's own backdrop layer to receive clicks.
    const lockNode = resolveModalLockNode();
    if (lockNode && target && !isAllowedModalPointerNode(target, target, lockNode)) return;

    let path = target ? ancestorsForTarget(target) : [];

    // When a modal is active, strip low-zIndex nodes from the bubble path so
    // events dispatched to elements *inside* the dialog never reach background
    // nodes during the bubble phase.
    if (lockNode && target && path.length > 0) {
      path = path.filter((n) => isAllowedModalPointerNode(n, target, lockNode));
    }

    const ev = buildPointerEvent(type, path, native);
    dispatchWithPhases(type, path, target, ev);
  }

  function dispatchToFocused(type: TerminalEventType, native: KeyboardEvent): void {
    const target = resolveLockedFocusTarget(type);
    const path = target ? ancestorsForTarget(target) : [];
    const ev = buildKeyboardEvent(type, path, native);
    dispatchWithPhases(type, path, target, ev);
    if (ev.defaultPrevented) native.preventDefault();
  }

  function buildInputEvent(
    type: TerminalEventType,
    path: TerminalNode[],
    native: Event,
  ): TerminalInputEvent & { __stopped: boolean } {
    const base = makeBaseEvent(type, path, native);
    const anyNative: any = native as any;
    const data = typeof anyNative.data === "string" ? anyNative.data : undefined;
    const inputType = typeof anyNative.inputType === "string" ? anyNative.inputType : undefined;
    const isComposing = Boolean(anyNative.isComposing);
    let text: string | undefined;
    if (type === "paste") {
      const clipboard = anyNative.clipboardData;
      if (clipboard?.getData) {
        text = clipboard.getData("text/plain") || clipboard.getData("text") || "";
      }
    }
    return Object.assign(base, { data, inputType, isComposing, text });
  }

  function dispatchToFocusedText(type: TerminalEventType, native: Event): void {
    const target = resolveLockedFocusTarget(type);
    const path = target ? ancestorsForTarget(target) : [];
    const ev = buildInputEvent(type, path, native);
    dispatchWithPhases(type, path, target, ev);
    if (ev.defaultPrevented) native.preventDefault?.();
  }

  function onPointerDown(e: PointerEvent): void {
    // Keep an actual text input focused so browsers can start IME/composition.
    // (The terminal container itself isn't an editable element.)
    if (textInputTarget && !container.contains(textInputTarget)) {
      try {
        (textInputTarget as any).focus?.({ preventScroll: true });
      } catch {
        textInputTarget.focus?.();
      }
      if (shouldDebugIme()) {
        const active =
          typeof document !== "undefined"
            ? ((document.activeElement as any)?.tagName ?? null)
            : null;
        imeLog("pointerdown focus textInputTarget", { active });
      }
    } else {
      try {
        (container as any).focus?.({ preventScroll: true });
      } catch {
        container.focus?.();
      }
    }
    const { cellX, cellY } = toCell(e.clientX, e.clientY);
    const list = candidatesAt(cellX, cellY);
    const target = pickTarget(list);

    // Block pointer-down on elements below an active modal/dialog
    // to prevent focus theft and event dispatch to background elements.
    const lockNode = resolveModalLockNode();
    if (lockNode && target && !isAllowedModalPointerNode(target, target, lockNode)) return;

    let path = target ? ancestorsForTarget(target) : [];

    // When a modal is active, strip low-zIndex nodes from the bubble path so
    // pointer-down events inside the dialog never reach background nodes.
    if (lockNode && target && path.length > 0) {
      path = path.filter((n) => isAllowedModalPointerNode(n, target, lockNode));
    }

    const allowSelection = target ? (target.selectable ?? !target.focusable) : true;
    container.style.userSelect = allowSelection ? defaultUserSelect : "none";
    if (target) {
      if (target.focusable) {
        setFocus(target.id);
      } else {
        // Clicking a non-focusable node should still focus the nearest focusable ancestor,
        // so keyboard navigation works for container-level widgets (e.g. transcript navigation).
        for (let i = path.length - 2; i >= 0; i--) {
          const n = path[i];
          if (n?.focusable) {
            setFocus(n.id);
            break;
          }
        }
      }
    }
    capturedId = target?.id ?? null;
    updateHover(target, e);
    record?.({
      type: "pointerdown",
      cellX,
      cellY,
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      buttons: e.buttons,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    });
    const ev = buildPointerEvent("pointerdown", path, e);
    dispatchWithPhases("pointerdown", path, target, ev);
  }

  function onMouseDown(e: MouseEvent): void {
    onPointerDown(e as any);
  }

  function onMouseMove(e: MouseEvent): void {
    lastPointerMoveEvent = e;
    onPointerMove(e as any);
  }

  function onMouseUp(e: MouseEvent): void {
    onPointerUp(e as any);
  }

  function onMouseLeave(e: MouseEvent): void {
    // Best-effort: clear hover state when leaving the terminal container.
    const native = lastPointerMoveEvent ?? e;
    updateHover(null, native);
  }

  function onPointerMove(e: PointerEvent): void {
    lastPointerMoveEvent = e;
    const { cellX, cellY } = toCell(e.clientX, e.clientY);
    record?.({
      type: "pointermove",
      cellX,
      cellY,
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      buttons: e.buttons,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    });
    if (capturedId) {
      const target = nodes.get(capturedId) ?? null;
      if (!target) return;
      updateHover(target, e);
      const path = ancestorsForTarget(target);
      const ev = buildPointerEvent("pointermove", path, e);
      dispatchWithPhases("pointermove", path, target, ev);
      return;
    }
    const list = candidatesAt(cellX, cellY);
    const target = pickTarget(list);
    updateHover(target, e);
    dispatchPointer("pointermove", e, target);
  }

  function onPointerUp(e: PointerEvent): void {
    const { cellX, cellY } = toCell(e.clientX, e.clientY);
    record?.({
      type: "pointerup",
      cellX,
      cellY,
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      buttons: e.buttons,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    });
    if (capturedId) {
      const target = nodes.get(capturedId) ?? null;
      const path = target ? ancestorsForTarget(target) : [];
      const ev = buildPointerEvent("pointerup", path, e);
      dispatchWithPhases("pointerup", path, target, ev);
    } else {
      dispatchPointer("pointerup", e);
    }
    capturedId = null;
    container.style.userSelect = defaultUserSelect;
  }

  function onClick(e: MouseEvent): void {
    const { cellX, cellY } = toCell(e.clientX, e.clientY);
    record?.({
      type: "click",
      cellX,
      cellY,
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      buttons: e.buttons,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    });
    dispatchPointer("click", e);
  }

  function onDblClick(e: MouseEvent): void {
    const { cellX, cellY } = toCell(e.clientX, e.clientY);
    record?.({
      type: "dblclick",
      cellX,
      cellY,
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      buttons: e.buttons,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    });
    dispatchPointer("dblclick", e);
  }

  function onContextMenu(e: MouseEvent): void {
    const { cellX, cellY } = toCell(e.clientX, e.clientY);
    record?.({
      type: "contextmenu",
      cellX,
      cellY,
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      buttons: e.buttons,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    });
    const list = candidatesAt(cellX, cellY);
    const target = pickTarget(list);
    const path = target ? ancestorsForTarget(target) : [];
    const ev = buildPointerEvent("contextmenu", path, e);
    dispatchWithPhases("contextmenu", path, target, ev);
    if (ev.defaultPrevented) e.preventDefault();
  }

  function onWheel(e: WheelEvent): void {
    const { cellX, cellY } = toCell(e.clientX, e.clientY);
    // Prevent browser page/viewport scrolling when the wheel is over terminal content.
    // This avoids visual flicker at the scroll boundary.
    const list = candidatesAt(cellX, cellY);
    if (list.length > 0) e.preventDefault();
    record?.({
      type: "wheel",
      cellX,
      cellY,
      clientX: e.clientX,
      clientY: e.clientY,
      deltaY: e.deltaY,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      deltaMode: e.deltaMode,
    });
    dispatchPointer("wheel", e);
  }

  function onKeyDown(e: KeyboardEvent): void {
    const targetIsTextInput = Boolean(
      textInputTarget &&
      (e.target === textInputTarget ||
        (e.target instanceof Node && textInputTarget.contains(e.target))),
    );

    if (targetIsTextInput) {
      const anyNative: any = e as any;
      const isComposing = Boolean(anyNative.isComposing);
      const keyCode = typeof anyNative.keyCode === "number" ? anyNative.keyCode : undefined;
      const key = e.key;

      // When the hidden text input is focused, let it handle normal text entry and IME.
      // We still forward navigation/editing keys so terminal widgets can respond.
      const isImeKey =
        domComposing ||
        isComposing ||
        key === "Process" ||
        key === "Unidentified" ||
        keyCode === 229;
      if (isImeKey) {
        imeLog("keydown ignored (ime composing)", {
          key,
          code: e.code,
          keyCode,
          isComposing,
          domComposing,
          focusedId,
        });
        return;
      }
      const isPlainTextKey = key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (isPlainTextKey) {
        imeLog("keydown ignored (textInput)", {
          key,
          code: e.code,
          keyCode,
          isComposing,
          domComposing,
          focusedId,
        });
        return;
      }
    }

    record?.({
      type: "keydown",
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      repeat: e.repeat,
    });
    dispatchToFocused("keydown", e);
  }

  function onKeyUp(e: KeyboardEvent): void {
    const targetIsTextInput = Boolean(
      textInputTarget &&
      (e.target === textInputTarget ||
        (e.target instanceof Node && textInputTarget.contains(e.target))),
    );
    if (targetIsTextInput) {
      const anyNative: any = e as any;
      const isComposing = Boolean(anyNative.isComposing);
      const keyCode = typeof anyNative.keyCode === "number" ? anyNative.keyCode : undefined;
      const key = e.key;
      const isImeKey =
        domComposing ||
        isComposing ||
        key === "Process" ||
        key === "Unidentified" ||
        keyCode === 229;
      if (isImeKey) {
        imeLog("keyup ignored (ime composing)", {
          key,
          code: e.code,
          keyCode,
          isComposing,
          domComposing,
          focusedId,
        });
        return;
      }
      const isPlainTextKey = key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (isPlainTextKey) {
        imeLog("keyup ignored (textInput)", {
          key,
          code: e.code,
          keyCode,
          isComposing,
          domComposing,
          focusedId,
        });
        return;
      }
    }

    record?.({
      type: "keyup",
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      repeat: e.repeat,
    });
    dispatchToFocused("keyup", e);
  }

  function onBeforeInput(e: Event): void {
    const anyNative: any = e as any;
    if (anyNative && typeof anyNative.isComposing === "boolean")
      domComposing = anyNative.isComposing;
    const targetIsTextInput = Boolean(
      textInputTarget &&
      (e.target === textInputTarget ||
        (e.target instanceof Node && textInputTarget.contains(e.target))),
    );
    const data = typeof anyNative.data === "string" ? anyNative.data : undefined;
    const inputType = typeof anyNative.inputType === "string" ? anyNative.inputType : undefined;
    // Prevent the hidden textarea's Enter key (insertLineBreak/insertParagraph, often data="\n")
    // from leaking into the terminal input (route changes can shift focusedId between keydown and input).
    const isPasteLike = inputType === "insertFromPaste" || inputType === "insertFromDrop";
    // Paste is handled via the explicit 'paste' event. Avoid double-dispatching paste
    // content via beforeinput/input (which can race focus changes and leak into other inputs).
    if (targetIsTextInput && isPasteLike) {
      anyNative?.preventDefault?.();
      (e as any)?.preventDefault?.();
      return;
    }
    const isLineBreakLike =
      inputType === "insertLineBreak" ||
      inputType === "insertParagraph" ||
      (data?.includes("\n") && !isPasteLike);
    if (targetIsTextInput && isLineBreakLike) {
      anyNative?.preventDefault?.();
      (e as any)?.preventDefault?.();
      return;
    }
    record?.({
      type: "beforeinput",
      data,
      inputType,
      isComposing: Boolean(anyNative.isComposing),
    });
    dispatchToFocusedText("beforeinput", e);
  }

  function onInput(e: Event): void {
    const anyNative: any = e as any;
    if (anyNative && typeof anyNative.isComposing === "boolean")
      domComposing = anyNative.isComposing;
    const targetIsTextInput = Boolean(
      textInputTarget &&
      (e.target === textInputTarget ||
        (e.target instanceof Node && textInputTarget.contains(e.target))),
    );
    const data = typeof anyNative.data === "string" ? anyNative.data : undefined;
    const inputType = typeof anyNative.inputType === "string" ? anyNative.inputType : undefined;
    // Prevent the hidden textarea's Enter key (insertLineBreak/insertParagraph, often data="\n")
    // from leaking into the terminal input (route changes can shift focusedId between keydown and input).
    const isPasteLike = inputType === "insertFromPaste" || inputType === "insertFromDrop";
    // Paste is handled via the explicit 'paste' event. Avoid double-dispatching paste
    // content via beforeinput/input (which can race focus changes and leak into other inputs).
    if (targetIsTextInput && isPasteLike) {
      anyNative?.preventDefault?.();
      (e as any)?.preventDefault?.();
      return;
    }
    const isLineBreakLike =
      inputType === "insertLineBreak" ||
      inputType === "insertParagraph" ||
      (data?.includes("\n") && !isPasteLike);
    if (targetIsTextInput && isLineBreakLike) {
      anyNative?.preventDefault?.();
      (e as any)?.preventDefault?.();
      return;
    }
    record?.({
      type: "input",
      data,
      inputType,
      isComposing: Boolean(anyNative.isComposing),
    });
    dispatchToFocusedText("input", e);
  }

  function onCompositionStart(e: Event): void {
    const anyNative: any = e as any;
    domComposing = true;
    record?.({
      type: "compositionstart",
      data: typeof anyNative.data === "string" ? anyNative.data : undefined,
      isComposing: Boolean(anyNative.isComposing),
    });
    imeLog("compositionstart", {
      data: typeof anyNative.data === "string" ? anyNative.data : undefined,
      isComposing: Boolean(anyNative.isComposing),
      focusedId,
    });
    dispatchToFocusedText("compositionstart", e);
  }

  function onCompositionUpdate(e: Event): void {
    const anyNative: any = e as any;
    record?.({
      type: "compositionupdate",
      data: typeof anyNative.data === "string" ? anyNative.data : undefined,
      isComposing: Boolean(anyNative.isComposing),
    });
    imeLog("compositionupdate", {
      data: typeof anyNative.data === "string" ? anyNative.data : undefined,
      isComposing: Boolean(anyNative.isComposing),
      focusedId,
    });
    dispatchToFocusedText("compositionupdate", e);
  }

  function onCompositionEnd(e: Event): void {
    const anyNative: any = e as any;
    domComposing = false;
    record?.({
      type: "compositionend",
      data: typeof anyNative.data === "string" ? anyNative.data : undefined,
      isComposing: Boolean(anyNative.isComposing),
    });
    imeLog("compositionend", {
      data: typeof anyNative.data === "string" ? anyNative.data : undefined,
      isComposing: Boolean(anyNative.isComposing),
      focusedId,
    });
    dispatchToFocusedText("compositionend", e);
  }

  function onDragOver(e: DragEvent): void {
    e.preventDefault();
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    // 获取拖拽的文件路径或文本
    let text = "";
    if (e.dataTransfer) {
      // 优先尝试获取文件路径
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files) as any[];
        const paths = files
          .map((file) => String(file?.path || file?.name || "").trim())
          .filter(Boolean);
        text = paths.join("\n");
      } else if (e.dataTransfer.types.includes("text/plain")) {
        text = e.dataTransfer.getData("text/plain");
      }
    }

    if (text) {
      record?.({
        type: "paste",
        text,
      });
      // 自动聚焦输入框
      if (textInputTarget) {
        try {
          (textInputTarget as any).focus?.({ preventScroll: true });
        } catch {
          textInputTarget.focus?.();
        }
      } else {
        try {
          (container as any).focus?.({ preventScroll: true });
        } catch {
          container.focus?.();
        }
      }

      // 尝试找到 TInput 组件并聚焦
      // 查找第一个可见的焦点able 节点（通常是 TInput）
      const focusableNodes = Array.from(nodes.values()).filter((n) => n.focusable && isVisible(n));
      if (focusableNodes.length > 0) {
        const targetNode = focusableNodes[0];
        setFocus(targetNode.id);
        // 分发 paste 事件到聚焦的节点
        // 由于 onDrop 事件不是标准的 paste 事件，我们需要手动构建并分发事件
        const path = targetNode ? ancestorsForTarget(targetNode) : [];
        const ev = buildInputEvent("paste", path, e);
        // 确保事件包含文本数据
        ev.text = text;
        dispatchWithPhases("paste", path, targetNode, ev);
      }
    }
  }

  function onPaste(e: Event): void {
    const anyNative: any = e as any;
    const clipboard = anyNative.clipboardData;
    let text = "";

    // 检查是否有文件数据
    if (clipboard?.files && clipboard.files.length > 0) {
      const file = clipboard.files[0] as any;
      text = file.path || file.name;
    } else if (clipboard?.getData) {
      // 否则获取文本数据
      text = clipboard.getData("text/plain") || clipboard.getData("text") || "";
    }

    record?.({
      type: "paste",
      text,
    });

    // 确保事件包含文本数据（用于 TInput 组件处理）
    if (focusedId) {
      const targetNode = nodes.get(focusedId);
      if (targetNode) {
        const path = ancestorsForTarget(targetNode);
        const ev = buildInputEvent("paste", path, e);
        ev.text = text;
        dispatchWithPhases("paste", path, targetNode, ev);
        if (ev.defaultPrevented) {
          anyNative?.preventDefault?.();
          (e as any)?.preventDefault?.();
        }
      }
    }
  }

  const textTargets: HTMLElement[] = [container];
  if (textInputTarget && textInputTarget !== container && !container.contains(textInputTarget)) {
    textTargets.push(textInputTarget);
  }

  const keyboardTargets: HTMLElement[] = [container];
  if (textInputTarget && textInputTarget !== container && !container.contains(textInputTarget)) {
    keyboardTargets.push(textInputTarget);
  }

  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", onPointerUp);
  container.addEventListener("mousedown", onMouseDown);
  container.addEventListener("mousemove", onMouseMove);
  container.addEventListener("mouseup", onMouseUp);
  container.addEventListener("mouseleave", onMouseLeave);
  container.addEventListener("click", onClick);
  container.addEventListener("dblclick", onDblClick);
  container.addEventListener("contextmenu", onContextMenu);
  container.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("dragover", onDragOver);
  container.addEventListener("drop", onDrop);
  for (const target of keyboardTargets) {
    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("keyup", onKeyUp);
  }

  for (const target of textTargets) {
    target.addEventListener("beforeinput", onBeforeInput as any);
    target.addEventListener("input", onInput as any);
    target.addEventListener("compositionstart", onCompositionStart as any);
    target.addEventListener("compositionupdate", onCompositionUpdate as any);
    target.addEventListener("compositionend", onCompositionEnd as any);
    target.addEventListener("paste", onPaste as any);
  }

  window.addEventListener("scroll", markContainerRectDirty, {
    capture: true,
    passive: true,
  });
  window.addEventListener("resize", markContainerRectDirty, { passive: true });

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
      // Replace existing registration safely.
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
    setMetrics(next) {
      currentMetrics = next;
      markContainerRectDirty();
    },
    canSelectAt(cellX, cellY) {
      const list = candidatesAt(cellX, cellY);
      const target = pickTarget(list);
      const lockNode = resolveModalLockNode();
      if (lockNode) {
        if (!target) return false;
        if (!isAllowedModalPointerNode(target, target, lockNode)) return false;
      }
      return target ? Boolean(target.selectable) : true;
    },
    autoScrollSelectionAt(originCellX, originCellY, pointerCellY) {
      const target = pickTarget(candidatesAt(originCellX, originCellY));
      if (!target) return 0;
      const lockNode = resolveModalLockNode();
      if (lockNode && !isAllowedModalPointerNode(target, target, lockNode)) return 0;
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
      window.removeEventListener("scroll", markContainerRectDirty, true);
      window.removeEventListener("resize", markContainerRectDirty);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("mousedown", onMouseDown);
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("mouseleave", onMouseLeave);
      container.removeEventListener("click", onClick);
      container.removeEventListener("dblclick", onDblClick);
      container.removeEventListener("contextmenu", onContextMenu);
      container.removeEventListener("wheel", onWheel);
      for (const target of keyboardTargets) {
        target.removeEventListener("keydown", onKeyDown);
        target.removeEventListener("keyup", onKeyUp);
      }
      for (const target of textTargets) {
        target.removeEventListener("beforeinput", onBeforeInput as any);
        target.removeEventListener("input", onInput as any);
        target.removeEventListener("compositionstart", onCompositionStart as any);
        target.removeEventListener("compositionupdate", onCompositionUpdate as any);
        target.removeEventListener("compositionend", onCompositionEnd as any);
        target.removeEventListener("paste", onPaste as any);
      }
      rowBuckets.clear();
      rowRangeById.clear();
      nodes.clear();
      focusedId = null;
      capturedId = null;
      hoverPath = [];
    },
  };
}
