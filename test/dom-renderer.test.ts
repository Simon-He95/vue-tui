import { describe, expect, it } from "vitest";
import { createDomRenderer, createTerminal } from "../src/index.js";

function setup(cols = 8, rows = 1) {
  const terminal = createTerminal({ cols, rows });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = createDomRenderer(terminal, container);
  return { terminal, container, renderer };
}

function lineEl(container: HTMLElement, y = 0): HTMLElement {
  const layer = container.querySelector('[data-vt-plane="default"]');
  const line = layer?.children[0]?.children[y] as HTMLElement | undefined;
  expect(line).toBeDefined();
  return line!;
}

describe("DomRenderer row rendering", () => {
  it("renders plain rows as a text node", () => {
    const { terminal, container, renderer } = setup();

    try {
      terminal.write("hello", { x: 0, y: 0 });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      expect(line.childNodes).toHaveLength(1);
      expect(line.firstChild?.nodeType).toBe(Node.TEXT_NODE);
      expect(line.querySelector("span")).toBeNull();
      expect(line.textContent).toBe("hello   ");
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("keeps styled rows on the span path", () => {
    const { terminal, container, renderer } = setup();

    try {
      terminal.write("red", { x: 0, y: 0, style: { fg: "red" } });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      const span = Array.from(line.querySelectorAll("span")).find((el) =>
        el.textContent?.includes("red"),
      ) as HTMLElement | undefined;
      expect(line.firstChild?.nodeName).toBe("SPAN");
      expect(span).toBeDefined();
      expect(span!.style.color).toBe("var(--vt-color-red)");
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("keeps wide rows on the span path", () => {
    const { terminal, container, renderer } = setup();

    try {
      terminal.write("中", { x: 0, y: 0 });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      expect(line.firstChild?.nodeName).toBe("SPAN");
      expect(line.querySelector("span")?.textContent).toContain("中");
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("clears styled spans when a row becomes plain again", () => {
    const { terminal, container, renderer } = setup();

    try {
      terminal.fill(0, 0, 8, 1, "A");
      terminal.commit({ planes: ["default"], sync: true });
      expect(lineEl(container).firstChild?.nodeType).toBe(Node.TEXT_NODE);

      terminal.fill(0, 0, 8, 1, "B", { fg: "red" });
      terminal.commit({ planes: ["default"], sync: true });
      expect(lineEl(container).firstChild?.nodeName).toBe("SPAN");

      terminal.fill(0, 0, 8, 1, "C");
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      expect(line.childNodes).toHaveLength(1);
      expect(line.firstChild?.nodeType).toBe(Node.TEXT_NODE);
      expect(line.querySelector("span")).toBeNull();
      expect(line.textContent).toBe("CCCCCCCC");
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("skips DOM writes when the row cache matches", () => {
    const { terminal, container, renderer } = setup();

    try {
      terminal.fill(0, 0, 8, 1, "A");
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      const textNode = line.firstChild!;
      let nodeValue = textNode.nodeValue;
      let nodeValueWrites = 0;
      Object.defineProperty(textNode, "nodeValue", {
        configurable: true,
        get: () => nodeValue,
        set: (next: string | null) => {
          nodeValueWrites++;
          nodeValue = next;
        },
      });

      terminal.fill(0, 0, 8, 1, "A");
      terminal.commit({ planes: ["default"], sync: true });

      expect(line.firstChild).toBe(textNode);
      expect(nodeValueWrites).toBe(0);
      expect(line.textContent).toBe("AAAAAAAA");
    } finally {
      renderer.dispose();
      container.remove();
    }
  });
});
