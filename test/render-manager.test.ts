import { describe, expect, it } from "vitest";
import { createTerminal } from "../src/index.js";
import { createRenderManager } from "../src/vue/render/render-manager.js";

describe("render-manager", () => {
  it("skips empty rect nodes on full repaint", () => {
    const paints: string[] = [];

    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size() {
        return { cols: 10, rows: 6 };
      },
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) {
          set = new Set();
          listeners.set(event, set);
        }
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 0, w: 10, h: 1 },
      paint: () => paints.push("visible"),
    });
    rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 0, w: 0, h: 0 },
      paint: () => paints.push("empty"),
    });

    const stats = rm.render();

    expect(paints).toEqual(["visible"]);
    expect(stats?.paintedNodes).toBe(1);
  });

  it("only paints nodes intersecting dirty rows on partial repaint", () => {
    const paints: string[] = [];

    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size() {
        return { cols: 10, rows: 6 };
      },
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) {
          set = new Set();
          listeners.set(event, set);
        }
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    const n0 = rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 0, w: 10, h: 1 },
      paint: () => paints.push("n0"),
    });
    rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 5, w: 10, h: 1 },
      paint: () => paints.push("n5"),
    });

    rm.render();
    expect(paints.sort()).toEqual(["n0", "n5"]);

    paints.length = 0;

    rm.update(n0.id, { rect: { x: 0, y: 0, w: 10, h: 1 } });
    rm.render();

    expect(paints).toEqual(["n0"]);
  });

  it("only paints nodes intersecting dirty rows when many rows are dirty", () => {
    const paints: string[] = [];

    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size() {
        return { cols: 10, rows: 100 };
      },
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) {
          set = new Set();
          listeners.set(event, set);
        }
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    const n0 = rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 10, w: 10, h: 1 },
      paint: () => paints.push("n0"),
    });
    rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 80, w: 10, h: 1 },
      paint: () => paints.push("n1"),
    });

    rm.render();
    expect(paints.sort()).toEqual(["n0", "n1"]);

    paints.length = 0;

    // Dirty 33 rows so the render-manager uses the bitset intersection path.
    rm.update(n0.id, { rect: { x: 0, y: 0, w: 10, h: 33 } });
    rm.render();

    expect(paints).toEqual(["n0"]);
  });

  it("uses latest node snapshot after update()", () => {
    const paints: string[] = [];

    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size() {
        return { cols: 10, rows: 6 };
      },
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) {
          set = new Set();
          listeners.set(event, set);
        }
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    const n0 = rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 0, w: 10, h: 1 },
      paint: () => paints.push("old"),
    });

    rm.render();
    expect(paints).toEqual(["old"]);

    paints.length = 0;

    rm.update(n0.id, { paint: () => paints.push("new") });
    rm.render();
    expect(paints).toEqual(["new"]);
  });

  it("marks only hinted dirty rows on update()", () => {
    const paints: string[] = [];

    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size() {
        return { cols: 10, rows: 6 };
      },
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) {
          set = new Set();
          listeners.set(event, set);
        }
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    const n0 = rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 0, w: 10, h: 6 },
      paint: (dirtyRows) => paints.push((dirtyRows ?? []).join(",")),
    });

    rm.render();
    paints.length = 0;

    rm.update(n0.id, {
      rect: { x: 0, y: 0, w: 10, h: 6 },
      dirtyRowsHint: [4, 5],
    });
    const stats = rm.render();

    expect(stats?.rows).toBe(2);
    expect(paints).toEqual(["4,5"]);
  });

  it("keeps cached rect bounds in sync after update()", () => {
    const paints: string[] = [];

    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size() {
        return { cols: 10, rows: 6 };
      },
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) {
          set = new Set();
          listeners.set(event, set);
        }
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    const n = rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 0, w: 10, h: 1 },
      paint: () => paints.push("n"),
    });

    rm.render();
    paints.length = 0;

    rm.update(n.id, { rect: { x: 0, y: 3, w: 10, h: 1 } });
    rm.render();

    expect(paints).toEqual(["n"]);
  });

  it("renders only the active dirty plane when updates are scoped", () => {
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size() {
        return { cols: 10, rows: 8 };
      },
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) {
          set = new Set();
          listeners.set(event, set);
        }
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    for (let i = 0; i < 20; i++) {
      rm.register({
        stack: rm.rootStack,
        plane: "transcript",
        rect: { x: 0, y: i % 4, w: 10, h: 1 },
        paint: () => {},
      });
    }
    const chrome = rm.register({
      stack: rm.rootStack,
      plane: "chrome",
      rect: { x: 0, y: 7, w: 10, h: 1 },
      paint: () => {},
    });

    rm.render();
    const stats = (() => {
      rm.update(chrome.id, { rect: { x: 0, y: 7, w: 10, h: 1 } });
      return rm.render({ activePlanes: ["chrome"] });
    })();

    expect(stats).not.toBe(null);
    expect(stats?.candidatePlanes).toEqual(["chrome"]);
    expect(stats?.scannedNodes).toBe(1);
  });

  it("does not repaint overlay when transcript updates beneath it", () => {
    const paints: string[] = [];
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size() {
        return { cols: 10, rows: 6 };
      },
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) {
          set = new Set();
          listeners.set(event, set);
        }
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    const transcript = rm.register({
      stack: rm.rootStack,
      plane: "transcript",
      rect: { x: 0, y: 2, w: 10, h: 1 },
      paint: () => paints.push("transcript"),
    });
    rm.register({
      stack: rm.rootStack,
      plane: "overlay",
      rect: { x: 0, y: 2, w: 10, h: 1 },
      paint: () => paints.push("overlay"),
    });

    rm.render();
    paints.length = 0;

    rm.update(transcript.id, { rect: { x: 0, y: 2, w: 10, h: 1 } });
    const stats = rm.render({ activePlanes: ["transcript"] });

    expect(stats?.candidatePlanes).toEqual(["transcript"]);
    expect(paints).toEqual(["transcript"]);
  });

  it("uses row buckets to reduce partial repaint candidates", () => {
    const paints: string[] = [];
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size: () => ({ cols: 10, rows: 100 }),
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) listeners.set(event, (set = new Set()));
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    let target: { id: string } | null = null;
    for (let i = 0; i < 100; i++) {
      const node = rm.register({
        stack: rm.rootStack,
        rect: { x: 0, y: i, w: 10, h: 1 },
        paint: () => paints.push(`n${i}`),
      });
      if (i === 42) target = node;
    }
    rm.render();
    paints.length = 0;

    rm.update(target!.id, { dirtyRowsHint: [42] });
    const stats = rm.render();

    expect(paints).toEqual(["n42"]);
    expect(stats?.paintedNodes).toBe(1);
    expect(stats?.scannedNodes).toBeLessThan(100);
  });

  it("keeps row buckets in sync across rect updates, plane migration, unregister, and global nodes", () => {
    const paints: string[] = [];
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size: () => ({ cols: 10, rows: 8 }),
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) listeners.set(event, (set = new Set()));
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    const global = rm.register({
      stack: rm.rootStack,
      rect: null,
      paint: () => paints.push("global"),
    });
    const node = rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 1, w: 10, h: 1 },
      paint: () => paints.push("node"),
    });
    const mover = rm.register({
      stack: rm.rootStack,
      plane: "default",
      rect: { x: 0, y: 2, w: 10, h: 1 },
      paint: () => paints.push("mover"),
    });
    rm.render();
    paints.length = 0;

    rm.update(node.id, { rect: { x: 0, y: 5, w: 10, h: 1 } });
    rm.render();
    expect(paints).toContain("node");

    paints.length = 0;
    rm.update(node.id, { dirtyRowsHint: [1] });
    rm.render();
    expect(paints).toEqual(["global"]);

    paints.length = 0;
    rm.update(mover.id, { plane: "overlay", dirtyRowsHint: [2] });
    rm.render({ activePlanes: ["default"] });
    expect(paints).toEqual(["global"]);

    paints.length = 0;
    rm.unregister(node.id);
    rm.render();
    paints.length = 0;
    rm.update(global.id, { dirtyRowsHint: [5] });
    rm.render();
    expect(paints).toEqual(["global"]);
  });

  it("moves nodes between row buckets and global buckets when rect becomes null", () => {
    const paints: string[] = [];
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size: () => ({ cols: 10, rows: 8 }),
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) listeners.set(event, (set = new Set()));
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    const node = rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 2, w: 10, h: 1 },
      paint: () => paints.push("node"),
    });
    rm.render();

    paints.length = 0;
    rm.update(node.id, { rect: null });
    rm.render();
    expect(paints).toEqual(["node"]);

    paints.length = 0;
    rm.update(node.id, { dirtyRowsHint: [7] });
    rm.render();
    expect(paints).toEqual(["node"]);

    paints.length = 0;
    rm.update(node.id, { rect: { x: 0, y: 4, w: 10, h: 1 } });
    rm.render();
    expect(paints).toEqual(["node"]);

    paints.length = 0;
    rm.update(node.id, { dirtyRowsHint: [7] });
    rm.render();
    expect(paints).toEqual([]);
  });

  it("marks old rect dirty when rect changes even with dirtyRowsHint", () => {
    const paints: string[] = [];
    const dirtyArgs: string[] = [];
    const terminal = createTerminal({ cols: 10, rows: 8 });
    const rm = createRenderManager(terminal);
    let currentY = 1;
    const node = rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 1, w: 10, h: 1 },
      paint: (dirtyRows) => {
        paints.push("node");
        dirtyArgs.push((dirtyRows ?? []).join(","));
        const rows = dirtyRows ?? [currentY];
        for (const y of rows) {
          if (y === currentY) terminal.write("NODE", { x: 0, y });
        }
      },
    });
    rm.render();
    terminal.commit();
    expect(
      terminal
        .getRow(1)
        .map((cell) => cell.ch)
        .join(""),
    ).toContain("NODE");

    paints.length = 0;
    dirtyArgs.length = 0;
    currentY = 5;
    rm.update(node.id, { rect: { x: 0, y: 5, w: 10, h: 1 }, dirtyRowsHint: [5] });
    const stats = rm.render();
    terminal.commit();

    expect(paints).toEqual(["node"]);
    expect(dirtyArgs).toEqual(["1,5"]);
    expect(stats?.rows).toBe(2);
    expect(
      terminal
        .getRow(1)
        .map((cell) => cell.ch)
        .join("")
        .trim(),
    ).toBe("");
    expect(
      terminal
        .getRow(5)
        .map((cell) => cell.ch)
        .join(""),
    ).toContain("NODE");
  });

  it("preserves sorted paint order for row-bucket partial repaint", () => {
    const paints: string[] = [];
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size: () => ({ cols: 10, rows: 5 }),
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) listeners.set(event, (set = new Set()));
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    const low = rm.register({
      stack: rm.rootStack,
      zIndex: 0,
      rect: { x: 0, y: 1, w: 10, h: 1 },
      paint: () => paints.push("low"),
    });
    rm.register({
      stack: rm.rootStack,
      zIndex: 10,
      rect: { x: 0, y: 1, w: 10, h: 1 },
      paint: () => paints.push("high"),
    });

    rm.render();
    paints.length = 0;
    rm.update(low.id, { dirtyRowsHint: [1] });
    rm.render();

    expect(paints).toEqual(["low", "high"]);
  });

  it("ignores dirtyRowsHint when zIndex changes", () => {
    const dirtyArgs: string[] = [];
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size: () => ({ cols: 10, rows: 5 }),
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) listeners.set(event, (set = new Set()));
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    const node = rm.register({
      stack: rm.rootStack,
      zIndex: 0,
      rect: { x: 0, y: 0, w: 10, h: 2 },
      paint: (dirtyRows) => dirtyArgs.push((dirtyRows ?? []).join(",")),
    });
    rm.register({
      stack: rm.rootStack,
      zIndex: 10,
      rect: { x: 0, y: 0, w: 10, h: 2 },
      paint: () => {},
    });
    rm.render();
    dirtyArgs.length = 0;

    rm.update(node.id, { zIndex: 20, dirtyRowsHint: [0] });
    rm.render();

    expect(dirtyArgs).toEqual(["0,1"]);
  });

  it("ignores dirtyRowsHint when stack changes", () => {
    const dirtyArgs: string[] = [];
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size: () => ({ cols: 10, rows: 5 }),
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) listeners.set(event, (set = new Set()));
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    const raisedStack = rm.createStack(rm.rootStack, 10);
    const node = rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 0, w: 10, h: 2 },
      paint: (dirtyRows) => dirtyArgs.push((dirtyRows ?? []).join(",")),
    });
    rm.render();
    dirtyArgs.length = 0;

    rm.update(node.id, { stack: raisedStack, dirtyRowsHint: [0] });
    rm.render();

    expect(dirtyArgs).toEqual(["0,1"]);
  });

  it("falls back to full plane scan but still filters by dirty-row intersection when dirty rows exceed 50%", () => {
    const paints: string[] = [];
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size: () => ({ cols: 10, rows: 100 }),
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) listeners.set(event, (set = new Set()));
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    // Register nodes across different rows
    // n0 at rows 0-9, n1 at rows 10-19, ..., n9 at rows 90-99
    for (let i = 0; i < 10; i++) {
      rm.register({
        stack: rm.rootStack,
        rect: { x: 0, y: i * 10, w: 10, h: 10 },
        paint: () => paints.push(`n${i}`),
      });
    }
    rm.render();
    paints.length = 0;

    // Register a wide node covering rows 0-59 (60 rows = 60% of 100)
    // This triggers dirtyRatio > 0.5 fallback
    const wide = rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 0, w: 10, h: 60 },
      paint: () => paints.push("wide"),
    });
    const stats = rm.render();

    // All nodes should be scanned (full plane fallback)
    expect(stats?.scannedNodes).toBe(11); // 10 original + 1 wide
    // But only nodes intersecting dirty rows [0-59] should paint:
    // wide (0-59), n0 (0-9), n1 (10-19), n2 (20-29), n3 (30-39), n4 (40-49), n5 (50-59)
    // n6 (60-69), n7 (70-79), n8 (80-89), n9 (90-99) should NOT paint
    expect(paints.sort()).toEqual(["n0", "n1", "n2", "n3", "n4", "n5", "wide"]);
    expect(stats?.paintedNodes).toBe(7);
  });

  it("falls back to full plane scan when bucket candidates exceed 60% of planeNodes", () => {
    const paints: string[] = [];
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const terminal: any = {
      size: () => ({ cols: 10, rows: 10 }),
      on(event: string, cb: (...args: any[]) => void) {
        let set = listeners.get(event);
        if (!set) listeners.set(event, (set = new Set()));
        set.add(cb);
        return () => set!.delete(cb);
      },
      batch(fn: () => void) {
        fn();
      },
      clear() {},
    };

    const rm = createRenderManager(terminal);
    // Register 5 nodes that all overlap rows 0-4
    const nodes: { id: string }[] = [];
    for (let i = 0; i < 5; i++) {
      nodes.push(
        rm.register({
          stack: rm.rootStack,
          rect: { x: 0, y: 0, w: 10, h: 5 },
          paint: () => paints.push(`n${i}`),
        }),
      );
    }
    rm.render();
    paints.length = 0;

    // Dirty rows 0-3 — all 5 nodes are candidates, which is 5/5 = 100% > 60% threshold
    rm.update(nodes[0]!.id, { dirtyRowsHint: [0, 1, 2, 3] });
    const stats = rm.render();

    // Should fall back to planeNodes since candidates (5) > planeNodes (5) * 0.6
    expect(stats?.scannedNodes).toBe(5);
    // All 5 nodes intersect dirty rows 0-3, so all should paint
    expect(paints.sort()).toEqual(["n0", "n1", "n2", "n3", "n4"]);
    expect(stats?.paintedNodes).toBe(5);
  });

  it("fallback scan does not paint non-intersecting nodes", () => {
    const paints: string[] = [];
    const terminal = createTerminal({ cols: 10, rows: 100 });
    const rm = createRenderManager(terminal);

    // Node A: covers rows 0-59 (intersects dirty rows)
    const nodeA = rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 0, w: 10, h: 60 },
      paint: () => paints.push("A"),
    });

    // Node B: covers rows 90-99 (does NOT intersect dirty rows 0-59)
    rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 90, w: 10, h: 10 },
      paint: () => paints.push("B"),
    });

    rm.render();
    paints.length = 0;

    // Re-register nodeA's rect — this marks rows 0-59 dirty (60/100 = 60% > 50%)
    // This triggers the dirtyRatio fallback, scanning all planeNodes
    rm.update(nodeA.id, { rect: { x: 0, y: 0, w: 10, h: 60 } });
    const stats = rm.render();

    // Both nodes are scanned (full plane fallback)
    expect(stats?.scannedNodes).toBe(2);
    // But B must NOT be painted since its rect (90-99) doesn't intersect dirty rows (0-59)
    expect(paints).not.toContain("B");
    // A should be painted (it intersects dirty rows)
    expect(paints).toContain("A");
    expect(stats?.paintedNodes).toBe(1);
  });

  it("fallback scan filters non-contiguous dirty rows exactly", () => {
    const paints: string[] = [];
    const terminal = createTerminal({ cols: 10, rows: 100 });
    const rm = createRenderManager(terminal);

    const first = rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 0, w: 10, h: 1 },
      paint: () => paints.push("first"),
    });

    rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 99, w: 10, h: 1 },
      paint: () => paints.push("last"),
    });

    rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 50, w: 10, h: 1 },
      paint: () => paints.push("middle"),
    });

    rm.render();
    paints.length = 0;

    rm.update(first.id, { dirtyRowsHint: [0, 99] });
    const stats = rm.render();

    expect(stats?.scannedNodes).toBe(3);
    expect(paints).toContain("first");
    expect(paints).toContain("last");
    expect(paints).not.toContain("middle");
    expect(stats?.paintedNodes).toBe(2);
  });

  it("rebuilds row buckets after terminal resize shrink", () => {
    const paints: string[] = [];
    const terminal = createTerminal({ cols: 10, rows: 8 });
    const rm = createRenderManager(terminal);
    const target = rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 1, w: 10, h: 1 },
      paint: () => paints.push("target"),
    });
    rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 7, w: 10, h: 1 },
      paint: () => paints.push("outside"),
    });
    rm.register({
      stack: rm.rootStack,
      rect: null,
      paint: () => paints.push("global"),
    });

    rm.render();
    terminal.resize(10, 4);
    rm.render();
    paints.length = 0;

    rm.update(target.id, { dirtyRowsHint: [1] });
    rm.render();

    expect(paints).toEqual(["target", "global"]);
  });

  it("rebuilds row buckets after terminal resize grow", () => {
    const paints: string[] = [];
    const terminal = createTerminal({ cols: 10, rows: 4 });
    const rm = createRenderManager(terminal);
    const node = rm.register({
      stack: rm.rootStack,
      rect: { x: 0, y: 6, w: 10, h: 1 },
      paint: () => paints.push("node"),
    });
    rm.register({
      stack: rm.rootStack,
      rect: null,
      paint: () => paints.push("global"),
    });

    rm.render();
    terminal.resize(10, 8);
    rm.render();
    paints.length = 0;

    rm.update(node.id, { dirtyRowsHint: [6] });
    rm.render();

    expect(paints).toEqual(["node", "global"]);
  });

  it("preserves nested stack order for row-bucket partial repaint", () => {
    const fullPaints: string[] = [];
    const partialPaints: string[] = [];
    const terminal = createTerminal({ cols: 10, rows: 5 });
    const rm = createRenderManager(terminal);
    const stackA = rm.createStack(rm.rootStack, 10);
    const stackB = rm.createStack(rm.rootStack, 20);
    const childA = rm.createStack(stackA, 0);
    const childB = rm.createStack(stackB, 0);
    let target: { id: string } | null = null;
    let phase: "full" | "partial" = "full";

    target = rm.register({
      stack: childA,
      rect: { x: 0, y: 1, w: 10, h: 1 },
      paint: () => (phase === "full" ? fullPaints : partialPaints).push("a"),
    });
    rm.register({
      stack: childB,
      rect: { x: 0, y: 1, w: 10, h: 1 },
      paint: () => (phase === "full" ? fullPaints : partialPaints).push("b"),
    });

    rm.render();
    phase = "partial";
    rm.update(target.id, { dirtyRowsHint: [1] });
    rm.render();

    expect(fullPaints).toEqual(["a", "b"]);
    expect(partialPaints).toEqual(["a", "b"]);
  });
});
