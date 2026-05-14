import { describe, expect, it, vi } from "vitest";
import { createDomRenderer, createTerminal } from "../src/index.js";
import { sanitizeDomHref } from "../src/core/hyperlink.js";

function setup(cols = 8, rows = 1, options: Parameters<typeof createDomRenderer>[2] = {}) {
  const terminal = createTerminal({ cols, rows });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = createDomRenderer(terminal, container, options);
  return { terminal, container, renderer };
}

function lineEl(container: HTMLElement, y = 0): HTMLElement {
  const layer = container.querySelector('[data-vt-plane="default"]');
  const line = layer?.children[0]?.children[y] as HTMLElement | undefined;
  expect(line).toBeDefined();
  return line!;
}

function lastRowStats(renderer: ReturnType<typeof createDomRenderer>) {
  const stats = renderer.debugStats.rowRender.lastFlush;
  expect(stats).not.toBeNull();
  return stats!;
}

describe("DomRenderer row rendering", () => {
  it("sanitizes DOM hrefs with an explicit allowlist", () => {
    expect(sanitizeDomHref("vbscript:msgbox(1)")).toBeNull();
    expect(sanitizeDomHref("JaVaScRiPt:alert(1)")).toBeNull();
    expect(sanitizeDomHref("data:text/html,boom")).toBeNull();
    expect(sanitizeDomHref("foo:bar")).toBeNull();
    expect(sanitizeDomHref("https://example.com")).toBe("https://example.com/");
    expect(sanitizeDomHref("https://example.com/a")).toBe("https://example.com/a");
    expect(sanitizeDomHref("https:example.com")).toBeNull();
    expect(sanitizeDomHref("http:\\example.com")).toBeNull();
    expect(sanitizeDomHref("docs/intro.md")).toBeNull();
    expect(sanitizeDomHref("./intro.md")).toBeNull();
    expect(sanitizeDomHref("../intro.md")).toBeNull();
    expect(sanitizeDomHref("#section")).toBeNull();
    expect(sanitizeDomHref("docs/intro.md", { allowRelative: true })).toBe("docs/intro.md");
    expect(sanitizeDomHref("\\evil", { allowRelative: true })).toBeNull();
    expect(sanitizeDomHref("//evil.test", { allowRelative: true })).toBeNull();
    expect(sanitizeDomHref("../ok", { allowRelative: true })).toBe("../ok");
    expect(sanitizeDomHref("#section", { allowRelative: true })).toBe("#section");
    expect(sanitizeDomHref("mailto:a@b.com?subject=x%0aBCC:c@d.com")).toBeNull();
    expect(sanitizeDomHref("https://example.com/a%20b")).toBe("https://example.com/a%20b");
  });

  it("applies the default browser accessibility contract", () => {
    const { container, renderer } = setup(4, 2);

    try {
      expect(container.tabIndex).toBe(0);
      expect(container.getAttribute("role")).toBe("application");
      expect(container.getAttribute("aria-label")).toBe("Terminal");
      expect(container.getAttribute("aria-live")).toBe("off");
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("lets hosts customize or disable browser accessibility attributes", () => {
    const custom = setup(4, 2, {
      accessibility: {
        role: "textbox",
        label: "Build log",
        describedBy: "build-log-help",
        live: "polite",
      },
    });
    const disabled = setup(4, 2, { accessibility: false });

    try {
      expect(custom.container.getAttribute("role")).toBe("textbox");
      expect(custom.container.getAttribute("aria-label")).toBe("Build log");
      expect(custom.container.getAttribute("aria-describedby")).toBe("build-log-help");
      expect(custom.container.getAttribute("aria-live")).toBe("polite");
      expect(custom.container.getAttribute("aria-multiline")).toBe("true");
      expect(custom.container.getAttribute("aria-readonly")).toBe("true");

      expect(disabled.container.hasAttribute("role")).toBe(false);
      expect(disabled.container.hasAttribute("aria-label")).toBe(false);
      expect(disabled.container.hasAttribute("aria-live")).toBe(false);
    } finally {
      custom.renderer.dispose();
      custom.container.remove();
      disabled.renderer.dispose();
      disabled.container.remove();
    }
  });

  it("preserves host-owned accessibility attributes when accessibility is false", () => {
    const terminal = createTerminal({ cols: 4, rows: 2 });
    const container = document.createElement("div");
    container.setAttribute("role", "region");
    container.setAttribute("aria-label", "Host wrapper");
    container.tabIndex = -1;
    document.body.appendChild(container);
    const renderer = createDomRenderer(terminal, container, {
      accessibility: false,
    });

    try {
      expect(container.getAttribute("role")).toBe("region");
      expect(container.getAttribute("aria-label")).toBe("Host wrapper");
      expect(container.tabIndex).toBe(-1);
    } finally {
      renderer.dispose();
      terminal.dispose();
      container.remove();
    }
  });

  it("records row stats during refresh", () => {
    const { container, renderer } = setup(4, 2);

    try {
      const stats = lastRowStats(renderer);
      expect(stats.rows).toBeGreaterThan(0);
      expect(stats.transparentBlankRows).toBe(stats.rows);
      expect(stats.replaceChildren).toBe(stats.rows);
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

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
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        plainTextRows: 1,
        textNodeUpdates: 1,
        fragmentRows: 0,
      });
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

  it("renders single styled rows as one span", () => {
    const { terminal, container, renderer } = setup(3);

    try {
      terminal.write("red", { x: 0, y: 0, style: { fg: "red" } });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      expect(line.childNodes).toHaveLength(1);
      expect(line.firstChild).toBeInstanceOf(HTMLSpanElement);
      expect((line.firstChild as HTMLSpanElement).textContent).toBe("red");
      expect((line.firstChild as HTMLSpanElement).dataset.vtFastRow).toBe("styled");
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        singleStyledRows: 1,
        spansCreated: 1,
        replaceChildren: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("reuses the single styled row span", () => {
    const { terminal, container, renderer } = setup(3);

    try {
      terminal.fill(0, 0, 3, 1, "A", { fg: "red" });
      terminal.commit({ planes: ["default"], sync: true });

      const span = lineEl(container).firstChild;

      terminal.fill(0, 0, 3, 1, "B", { fg: "blue" });
      terminal.commit({ planes: ["default"], sync: true });

      expect(lineEl(container).firstChild).toBe(span);
      expect(lineEl(container).textContent).toBe("BBB");
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("resets reused single styled row span styles", () => {
    const { terminal, container, renderer } = setup(3);

    try {
      terminal.fill(0, 0, 3, 1, "A", { fg: "red", underline: true });
      terminal.commit({ planes: ["default"], sync: true });

      const span = lineEl(container).firstChild as HTMLSpanElement;
      expect(span.style.textDecoration).toBe("underline");

      terminal.fill(0, 0, 3, 1, "B", { fg: "blue" });
      terminal.commit({ planes: ["default"], sync: true });

      expect(lineEl(container).firstChild).toBe(span);
      expect(span.style.color).toBe("var(--vt-color-blue)");
      expect(span.style.textDecoration).toBe("");
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("reuses multi-segment row spans", () => {
    const { terminal, container, renderer } = setup(4);

    try {
      terminal.fill(0, 0, 2, 1, "A", { fg: "red" });
      terminal.fill(2, 0, 2, 1, "B", { fg: "blue" });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      const firstSpan = line.childNodes[0];
      const secondSpan = line.childNodes[1];
      expect(line.childNodes).toHaveLength(2);
      expect((firstSpan as HTMLSpanElement).dataset.vtFastRow).toBe("segment");
      expect((secondSpan as HTMLSpanElement).dataset.vtFastRow).toBe("segment");

      terminal.fill(0, 0, 2, 1, "C", { fg: "red" });
      terminal.fill(2, 0, 2, 1, "D", { fg: "blue" });
      terminal.commit({ planes: ["default"], sync: true });

      expect(line.childNodes).toHaveLength(2);
      expect(line.childNodes[0]).toBe(firstSpan);
      expect(line.childNodes[1]).toBe(secondSpan);
      expect(line.textContent).toBe("CCDD");
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 0,
        segmentReuseRows: 1,
        fragmentRows: 0,
        spansReused: 2,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("keeps separated style runs as separate segments", () => {
    const { terminal, container, renderer } = setup(3);

    try {
      terminal.write("A", { x: 0, y: 0, style: { fg: "red" } });
      terminal.write("B", { x: 1, y: 0, style: { fg: "blue" } });
      terminal.write("C", { x: 2, y: 0, style: { fg: "red" } });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      const spans = Array.from(line.querySelectorAll("span"));
      expect(spans).toHaveLength(3);
      expect(spans.map((span) => span.textContent)).toEqual(["A", "B", "C"]);
      expect(spans[0]!.style.color).toBe("var(--vt-color-red)");
      expect(spans[1]!.style.color).toBe("var(--vt-color-blue)");
      expect(spans[2]!.style.color).toBe("var(--vt-color-red)");
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("merges continuous same-style runs", () => {
    const { terminal, container, renderer } = setup(3);

    try {
      terminal.write("A", { x: 0, y: 0, style: { fg: "red" } });
      terminal.write("B", { x: 1, y: 0, style: { fg: "red" } });
      terminal.write("C", { x: 2, y: 0, style: { fg: "blue" } });
      terminal.commit({ planes: ["default"], sync: true });

      const spans = Array.from(lineEl(container).querySelectorAll("span"));
      expect(spans).toHaveLength(2);
      expect(spans.map((span) => span.textContent)).toEqual(["AB", "C"]);
      expect(spans[0]!.style.color).toBe("var(--vt-color-red)");
      expect(spans[1]!.style.color).toBe("var(--vt-color-blue)");
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("resets reused multi-segment row span styles", () => {
    const { terminal, container, renderer } = setup(4);

    try {
      terminal.fill(0, 0, 2, 1, "A", { fg: "red", underline: true });
      terminal.fill(2, 0, 2, 1, "B", { fg: "blue" });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      const span = line.childNodes[0] as HTMLSpanElement;
      expect(span.style.textDecoration).toBe("underline");

      terminal.fill(0, 0, 2, 1, "C", { fg: "blue" });
      terminal.fill(2, 0, 2, 1, "D", { fg: "red" });
      terminal.commit({ planes: ["default"], sync: true });

      expect(line.childNodes[0]).toBe(span);
      expect(span.style.color).toBe("var(--vt-color-blue)");
      expect(span.style.textDecoration).toBe("");
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("replaces multi-segment row spans when the segment count changes", () => {
    const { terminal, container, renderer } = setup(6);

    try {
      terminal.fill(0, 0, 3, 1, "A", { fg: "red" });
      terminal.fill(3, 0, 3, 1, "B", { fg: "blue" });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      const firstSpan = line.childNodes[0];
      const secondSpan = line.childNodes[1];
      expect(line.childNodes).toHaveLength(2);

      terminal.fill(0, 0, 2, 1, "C", { fg: "red" });
      terminal.fill(2, 0, 2, 1, "D", { fg: "blue" });
      terminal.fill(4, 0, 2, 1, "E", { fg: "green" });
      terminal.commit({ planes: ["default"], sync: true });

      expect(line.childNodes).toHaveLength(3);
      expect(line.childNodes[0]).not.toBe(firstSpan);
      expect(line.childNodes[1]).not.toBe(secondSpan);
      expect(line.textContent).toBe("CCDDEE");
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        segmentReuseRows: 0,
        fragmentRows: 1,
        spansCreated: 3,
        replaceChildren: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("renders styled rows as plain text when they become plain", () => {
    const { terminal, container, renderer } = setup(3);

    try {
      terminal.fill(0, 0, 3, 1, "A", { fg: "red" });
      terminal.commit({ planes: ["default"], sync: true });
      expect(lineEl(container).firstChild).toBeInstanceOf(HTMLSpanElement);

      terminal.fill(0, 0, 3, 1, "B");
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      expect(line.childNodes).toHaveLength(1);
      expect(line.firstChild?.nodeType).toBe(Node.TEXT_NODE);
      expect(line.querySelector("span")).toBeNull();
      expect(line.textContent).toBe("BBB");
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("replaces plain text nodes with one span when rows become styled", () => {
    const { terminal, container, renderer } = setup(3);

    try {
      terminal.fill(0, 0, 3, 1, "A");
      terminal.commit({ planes: ["default"], sync: true });
      expect(lineEl(container).firstChild?.nodeType).toBe(Node.TEXT_NODE);

      terminal.fill(0, 0, 3, 1, "B", { fg: "red" });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      expect(line.childNodes).toHaveLength(1);
      expect(line.firstChild).toBeInstanceOf(HTMLSpanElement);
      expect((line.firstChild as HTMLSpanElement).dataset.vtFastRow).toBe("styled");
      expect(line.textContent).toBe("BBB");
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("does not mark href multi-segment rows for reuse", () => {
    const { terminal, container, renderer } = setup(4);

    try {
      terminal.fill(0, 0, 2, 1, "A", { href: "https://example.com" });
      terminal.fill(2, 0, 2, 1, "B", { fg: "blue" });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      expect(line.childNodes).toHaveLength(2);
      for (const child of Array.from(line.children) as HTMLSpanElement[])
        expect(child.dataset.vtFastRow).toBeUndefined();
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("keeps styled href rows on the fast path when links are disabled", () => {
    const { terminal, container, renderer } = setup(4, 2, { links: false });

    try {
      terminal.fill(0, 0, 4, 1, "L", { href: "https://example.com", underline: true });
      terminal.commit({ planes: ["default"], sync: true });

      expect(container.querySelector("a")).toBeNull();
      expect(renderer.debugStats.rowRender.total.singleStyledRows).toBeGreaterThan(0);
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("does not mark wide multi-segment rows for reuse", () => {
    const { terminal, container, renderer } = setup(4);

    try {
      terminal.write("中", { x: 0, y: 0, style: { fg: "red" } });
      terminal.fill(2, 0, 2, 1, "B", { fg: "blue" });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      expect(line.textContent).toContain("中");
      expect(line.querySelector('[data-vt-fast-row="segment"]')).toBeNull();
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("renders safe href rows as anchors on the fragment path", () => {
    const { terminal, container, renderer } = setup(3);

    try {
      terminal.write("url", { x: 0, y: 0, style: { href: "https://example.com" } });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      expect(line.childNodes).toHaveLength(1);
      expect(line.firstChild).toBeInstanceOf(HTMLAnchorElement);
      const anchor = line.firstChild as HTMLAnchorElement;
      expect(anchor.href).toBe("https://example.com/");
      expect(anchor.target).toBe("_blank");
      expect(anchor.rel).toBe("noopener noreferrer");
      expect(anchor.tabIndex).toBe(-1);
      expect(anchor.draggable).toBe(false);
      expect(anchor.dataset.vtFastRow).toBeUndefined();
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        fragmentRows: 1,
        spansCreated: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("makes DOM href anchors pointer-interactive", () => {
    const { terminal, container, renderer } = setup(3);

    try {
      terminal.write("url", { x: 0, y: 0, style: { href: "https://example.com" } });
      terminal.commit({ planes: ["default"], sync: true });

      const anchor = lineEl(container).querySelector("a");
      expect(anchor).toBeInstanceOf(HTMLAnchorElement);
      expect(anchor?.style.pointerEvents).toBe("auto");
      expect(anchor?.style.cursor).toBe("pointer");
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("allows native DOM link activation by default", () => {
    const { terminal, container, renderer } = setup(3);

    try {
      terminal.write("url", { x: 0, y: 0, style: { href: "https://example.com" } });
      terminal.commit({ planes: ["default"], sync: true });

      const anchor = lineEl(container).querySelector("a");
      expect(anchor).toBeInstanceOf(HTMLAnchorElement);
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      expect(anchor?.dispatchEvent(event)).toBe(true);
      expect(event.defaultPrevented).toBe(false);
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("prevents native activation when host handles DOM link activation", () => {
    const onActivate = vi.fn();
    const { terminal, container, renderer } = setup(3, 1, {
      links: { onActivate },
    });

    try {
      terminal.write("url", { x: 0, y: 0, style: { href: "https://example.com" } });
      terminal.commit({ planes: ["default"], sync: true });

      const anchor = lineEl(container).querySelector("a");
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      expect(anchor?.dispatchEvent(event)).toBe(false);

      expect(event.defaultPrevented).toBe(true);
      expect(onActivate).toHaveBeenCalledWith("https://example.com/", event);
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("can explicitly disable DOM link activation", () => {
    const { terminal, container, renderer } = setup(3, 1, {
      links: { activation: "none" },
    });

    try {
      terminal.write("url", { x: 0, y: 0, style: { href: "https://example.com" } });
      terminal.commit({ planes: ["default"], sync: true });

      const anchor = lineEl(container).querySelector("a");
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      expect(anchor?.dispatchEvent(event)).toBe(false);
      expect(event.defaultPrevented).toBe(true);
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("allows native DOM link activation when explicitly configured", () => {
    const { terminal, container, renderer } = setup(3, 1, {
      links: { activation: "native" },
    });

    try {
      terminal.write("url", { x: 0, y: 0, style: { href: "https://example.com" } });
      terminal.commit({ planes: ["default"], sync: true });

      const anchor = lineEl(container).querySelector("a");
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      expect(anchor?.dispatchEvent(event)).toBe(true);
      expect(event.defaultPrevented).toBe(false);
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("lets hosts customize DOM link tabIndex", () => {
    const { terminal, container, renderer } = setup(3, 1, {
      links: { tabIndex: 0 },
    });

    try {
      terminal.write("url", { x: 0, y: 0, style: { href: "https://example.com" } });
      terminal.commit({ planes: ["default"], sync: true });

      expect(lineEl(container).querySelector("a")?.tabIndex).toBe(0);
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("does not render relative hrefs as anchors by default", () => {
    const { terminal, container, renderer } = setup(10);

    try {
      terminal.write("docs", { x: 0, y: 0, style: { href: "docs/intro.md" } });
      terminal.commit({ planes: ["default"], sync: true });

      expect(lineEl(container).querySelector("a")).toBeNull();
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("renders relative hrefs only when explicitly enabled", () => {
    const { terminal, container, renderer } = setup(10, 1, {
      links: { allowRelative: true },
    });

    try {
      terminal.write("docs", { x: 0, y: 0, style: { href: "docs/intro.md" } });
      terminal.commit({ planes: ["default"], sync: true });

      const anchor = lineEl(container).querySelector("a");
      expect(anchor).toBeInstanceOf(HTMLAnchorElement);
      expect(anchor?.getAttribute("href")).toBe("docs/intro.md");
      expect(anchor?.getAttribute("target")).toBeNull();
      expect(anchor?.getAttribute("rel")).toBeNull();
      expect(anchor?.tabIndex).toBe(-1);
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("creates row nodes using the container ownerDocument", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument!;
    const terminal = createTerminal({ cols: 3, rows: 1 });
    const container = doc.createElement("div");
    doc.body.appendChild(container);
    const renderer = createDomRenderer(terminal, container);

    try {
      terminal.write("url", { x: 0, y: 0, style: { href: "https://example.com" } });
      terminal.commit({ planes: ["default"], sync: true });

      const anchor = container.querySelector("a");
      expect(anchor?.ownerDocument).toBe(doc);
    } finally {
      renderer.dispose();
      terminal.dispose();
      iframe.remove();
    }
  });

  it("does not force hash links into a new tab when relative links are enabled", () => {
    const { terminal, container, renderer } = setup(8, 1, {
      links: { allowRelative: true },
    });

    try {
      terminal.write("hash", { x: 0, y: 0, style: { href: "#section" } });
      terminal.commit({ planes: ["default"], sync: true });

      const anchor = lineEl(container).querySelector("a");
      expect(anchor).toBeInstanceOf(HTMLAnchorElement);
      expect(anchor?.getAttribute("href")).toBe("#section");
      expect(anchor?.getAttribute("target")).toBeNull();
      expect(anchor?.getAttribute("rel")).toBeNull();
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("does not force mailto links into a new tab", () => {
    const { terminal, container, renderer } = setup(4);

    try {
      terminal.write("mail", { x: 0, y: 0, style: { href: "mailto:test@example.com" } });
      terminal.commit({ planes: ["default"], sync: true });

      const anchor = lineEl(container).querySelector("a");
      expect(anchor).toBeInstanceOf(HTMLAnchorElement);
      expect(anchor?.getAttribute("href")).toBe("mailto:test@example.com");
      expect(anchor?.getAttribute("target")).toBeNull();
      expect(anchor?.getAttribute("rel")).toBeNull();
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("keeps unsafe href rows as spans", () => {
    for (const href of [
      "//evil.example",
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,boom",
      "vbscript:msgbox(1)",
    ]) {
      const { terminal, container, renderer } = setup(3);

      try {
        terminal.write("url", { x: 0, y: 0, style: { href } });
        terminal.commit({ planes: ["default"], sync: true });

        const line = lineEl(container);
        expect(line.firstChild).toBeInstanceOf(HTMLSpanElement);
        expect(line.querySelector("a")).toBeNull();
      } finally {
        renderer.dispose();
        container.remove();
      }
    }
  });

  it("invalidates the row cache when href changes", () => {
    const { terminal, container, renderer } = setup(3);

    try {
      terminal.write("url", { x: 0, y: 0, style: { href: "https://a.example" } });
      terminal.commit({ planes: ["default"], sync: true });

      terminal.write("url", { x: 0, y: 0, style: { href: "https://b.example" } });
      terminal.commit({ planes: ["default"], sync: true });

      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 0,
        fragmentRows: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("keeps wide styled rows on the fragment span path", () => {
    const { terminal, container, renderer } = setup(2);

    try {
      terminal.write("中", { x: 0, y: 0, style: { fg: "red" } });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      expect(line.childNodes).toHaveLength(1);
      expect(line.firstChild).toBeInstanceOf(HTMLSpanElement);
      expect((line.firstChild as HTMLSpanElement).dataset.vtFastRow).toBeUndefined();
      expect(line.textContent).toContain("中");
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        fragmentRows: 1,
        spansCreated: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("skips wide continuation cells", () => {
    const { terminal, container, renderer } = setup(4);

    try {
      terminal.write("中", { x: 0, y: 0 });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      expect(line.textContent).toBe("中  ");
      expect(line.querySelectorAll("span")).toHaveLength(2);
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

  it("uses auto row key prepass by default after the first flush", () => {
    const { terminal, container, renderer } = setup();

    try {
      expect(renderer.debugStats.rowKeyPrepass).toMatchObject({
        mode: "auto",
        decision: "sampling",
      });

      terminal.fill(0, 0, 8, 1, "A");
      terminal.commit({ planes: ["default"], sync: true });

      terminal.fill(0, 0, 8, 1, "A");
      terminal.commit({ planes: ["default"], sync: true });

      expect(lineEl(container).textContent).toBe("AAAAAAAA");
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 1,
        rowKeyPrepassChecks: 1,
        rowKeyPrepassHits: 1,
        rowKeyPrepassMisses: 0,
        plainTextRows: 0,
        fragmentRows: 0,
        textNodeUpdates: 0,
        replaceChildren: 0,
      });
      expect(renderer.debugStats.rowKeyPrepass).toMatchObject({
        decision: "sampling",
        sampleRows: 1,
        sampleHits: 1,
        sampleMisses: 0,
        sampleHitRatio: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("respects explicit false row key prepass override", () => {
    const { terminal, container, renderer } = setup(8, 1, { enableRowKeyPrepass: false });

    try {
      expect(renderer.debugStats.rowKeyPrepass).toMatchObject({
        mode: false,
        decision: "forced-disabled",
      });

      terminal.fill(0, 0, 8, 1, "A");
      terminal.commit({ planes: ["default"], sync: true });

      terminal.fill(0, 0, 8, 1, "A");
      terminal.commit({ planes: ["default"], sync: true });

      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 1,
        rowKeyPrepassChecks: 0,
        rowKeyPrepassHits: 0,
        rowKeyPrepassMisses: 0,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("does not count the initial opt-in render as a row key prepass check", () => {
    const { container, renderer } = setup(8, 1, { enableRowKeyPrepass: true });

    try {
      expect(renderer.debugStats.rowKeyPrepass).toMatchObject({
        mode: true,
        decision: "forced-enabled",
      });
      expect(lastRowStats(renderer)).toMatchObject({
        rowKeyPrepassChecks: 0,
        rowKeyPrepassHits: 0,
        rowKeyPrepassMisses: 0,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("auto row key prepass enables for cache-heavy rows", () => {
    const rows = 512;
    const { terminal, container, renderer } = setup(4, rows, {
      syncFlushMaxRows: rows,
      syncFlushCellBudget: rows * 4,
    });

    try {
      for (let y = 0; y < rows; y++) terminal.fill(0, y, 4, 1, "A");
      terminal.commit({ planes: ["default"], sync: true });

      expect(lastRowStats(renderer)).toMatchObject({
        rowKeyPrepassChecks: 0,
      });
      expect(renderer.debugStats.rowKeyPrepass.decision).toBe("sampling");

      for (let y = 0; y < rows; y++) terminal.fill(0, y, 4, 1, "A");
      terminal.commit({ planes: ["default"], sync: true });

      expect(lastRowStats(renderer)).toMatchObject({
        rows,
        cacheHits: rows,
        rowKeyPrepassChecks: rows,
        rowKeyPrepassHits: rows,
        rowKeyPrepassMisses: 0,
      });
      expect(renderer.debugStats.rowKeyPrepass).toMatchObject({
        decision: "enabled",
        sampleRows: 0,
        sampleHits: 0,
        sampleMisses: 0,
        lastSampleRows: rows,
        lastSampleHitRatio: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("auto row key prepass disables for miss-heavy rows", () => {
    const rows = 512;
    const { terminal, container, renderer } = setup(4, rows, {
      syncFlushMaxRows: rows,
      syncFlushCellBudget: rows * 4,
    });

    try {
      for (let y = 0; y < rows; y++) terminal.fill(0, y, 4, 1, "A");
      terminal.commit({ planes: ["default"], sync: true });

      for (let y = 0; y < rows; y++) terminal.fill(0, y, 4, 1, "B");
      terminal.commit({ planes: ["default"], sync: true });

      expect(lastRowStats(renderer)).toMatchObject({
        rows,
        cacheHits: 0,
        rowKeyPrepassChecks: rows,
        rowKeyPrepassHits: 0,
        rowKeyPrepassMisses: rows,
      });
      expect(renderer.debugStats.rowKeyPrepass).toMatchObject({
        decision: "disabled",
        sampleRows: 0,
        sampleHits: 0,
        sampleMisses: 0,
        lastSampleRows: rows,
        lastSampleHitRatio: 0,
      });

      for (let y = 0; y < rows; y++) terminal.fill(0, y, 4, 1, "C");
      terminal.commit({ planes: ["default"], sync: true });

      expect(lastRowStats(renderer)).toMatchObject({
        rows,
        cacheHits: 0,
        rowKeyPrepassChecks: 0,
        rowKeyPrepassHits: 0,
        rowKeyPrepassMisses: 0,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("skips DOM writes when the opt-in row cache matches", () => {
    const { terminal, container, renderer } = setup(8, 1, { enableRowKeyPrepass: true });

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
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 1,
        rowKeyPrepassChecks: 1,
        rowKeyPrepassHits: 1,
        rowKeyPrepassMisses: 0,
        plainTextRows: 0,
        singleStyledRows: 0,
        segmentReuseRows: 0,
        fragmentRows: 0,
        spansCreated: 0,
        spansReused: 0,
        textNodeUpdates: 0,
        replaceChildren: 0,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("invalidates the opt-in row prepass when plain text changes", () => {
    const { terminal, container, renderer } = setup(4, 1, { enableRowKeyPrepass: true });

    try {
      terminal.fill(0, 0, 4, 1, "A");
      terminal.commit({ planes: ["default"], sync: true });

      terminal.fill(0, 0, 4, 1, "B");
      terminal.commit({ planes: ["default"], sync: true });

      expect(lineEl(container).textContent).toBe("BBBB");
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 0,
        rowKeyPrepassChecks: 1,
        rowKeyPrepassHits: 0,
        rowKeyPrepassMisses: 1,
        plainTextRows: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("invalidates the plain row cache when text changes", () => {
    const { terminal, container, renderer } = setup(4);

    try {
      terminal.fill(0, 0, 4, 1, "A");
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      const textNode = line.firstChild;

      terminal.fill(0, 0, 4, 1, "B");
      terminal.commit({ planes: ["default"], sync: true });

      expect(line.firstChild).toBe(textNode);
      expect(line.textContent).toBe("BBBB");
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 0,
        plainTextRows: 1,
        textNodeUpdates: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("invalidates the single styled row cache when style changes", () => {
    const { terminal, container, renderer } = setup(3);

    try {
      terminal.fill(0, 0, 3, 1, "A", { fg: "red" });
      terminal.commit({ planes: ["default"], sync: true });

      const span = lineEl(container).firstChild as HTMLSpanElement;

      terminal.fill(0, 0, 3, 1, "A", { fg: "blue" });
      terminal.commit({ planes: ["default"], sync: true });

      expect(lineEl(container).firstChild).toBe(span);
      expect(span.style.color).toBe("var(--vt-color-blue)");
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 0,
        singleStyledRows: 1,
        spansReused: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("skips single styled DOM writes when the row cache matches", () => {
    const { terminal, container, renderer } = setup(3, 1, { enableRowKeyPrepass: true });

    try {
      terminal.fill(0, 0, 3, 1, "A", { fg: "red" });
      terminal.commit({ planes: ["default"], sync: true });

      const span = lineEl(container).firstChild;

      terminal.fill(0, 0, 3, 1, "A", { fg: "red" });
      terminal.commit({ planes: ["default"], sync: true });

      expect(lineEl(container).firstChild).toBe(span);
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 1,
        rowKeyPrepassChecks: 1,
        rowKeyPrepassHits: 1,
        rowKeyPrepassMisses: 0,
        singleStyledRows: 0,
        fragmentRows: 0,
        spansCreated: 0,
        spansReused: 0,
        replaceChildren: 0,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("skips multi-segment DOM writes when the row cache matches", () => {
    const { terminal, container, renderer } = setup(4, 1, { enableRowKeyPrepass: true });

    try {
      terminal.fill(0, 0, 2, 1, "A", { fg: "red" });
      terminal.fill(2, 0, 2, 1, "B", { fg: "blue" });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      const firstSpan = line.childNodes[0];
      const secondSpan = line.childNodes[1];

      terminal.fill(0, 0, 2, 1, "A", { fg: "red" });
      terminal.fill(2, 0, 2, 1, "B", { fg: "blue" });
      terminal.commit({ planes: ["default"], sync: true });

      expect(line.childNodes[0]).toBe(firstSpan);
      expect(line.childNodes[1]).toBe(secondSpan);
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 1,
        rowKeyPrepassChecks: 1,
        rowKeyPrepassHits: 1,
        rowKeyPrepassMisses: 0,
        segmentReuseRows: 0,
        fragmentRows: 0,
        spansCreated: 0,
        spansReused: 0,
        replaceChildren: 0,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("invalidates the opt-in row prepass when a single styled row changes", () => {
    const { terminal, container, renderer } = setup(3, 1, { enableRowKeyPrepass: true });

    try {
      terminal.fill(0, 0, 3, 1, "A", { fg: "red" });
      terminal.commit({ planes: ["default"], sync: true });

      const span = lineEl(container).firstChild as HTMLSpanElement;

      terminal.fill(0, 0, 3, 1, "A", { fg: "blue" });
      terminal.commit({ planes: ["default"], sync: true });

      expect(lineEl(container).firstChild).toBe(span);
      expect(span.style.color).toBe("var(--vt-color-blue)");
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 0,
        rowKeyPrepassChecks: 1,
        rowKeyPrepassHits: 0,
        rowKeyPrepassMisses: 1,
        singleStyledRows: 1,
        spansReused: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("invalidates the opt-in row prepass when multi-segment styles change order", () => {
    const { terminal, container, renderer } = setup(4, 1, { enableRowKeyPrepass: true });

    try {
      terminal.fill(0, 0, 2, 1, "A", { fg: "red" });
      terminal.fill(2, 0, 2, 1, "B", { fg: "blue" });
      terminal.commit({ planes: ["default"], sync: true });

      terminal.fill(0, 0, 2, 1, "A", { fg: "blue" });
      terminal.fill(2, 0, 2, 1, "B", { fg: "red" });
      terminal.commit({ planes: ["default"], sync: true });

      const spans = Array.from(lineEl(container).querySelectorAll("span"));
      expect(spans[0]!.style.color).toBe("var(--vt-color-blue)");
      expect(spans[1]!.style.color).toBe("var(--vt-color-red)");
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 0,
        rowKeyPrepassChecks: 1,
        rowKeyPrepassHits: 0,
        rowKeyPrepassMisses: 1,
        segmentReuseRows: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("keeps multi-segment order in the row cache key", () => {
    const { terminal, container, renderer } = setup(4);

    try {
      terminal.fill(0, 0, 2, 1, "A", { fg: "red" });
      terminal.fill(2, 0, 2, 1, "B", { fg: "blue" });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      const firstSpan = line.childNodes[0] as HTMLSpanElement;
      const secondSpan = line.childNodes[1] as HTMLSpanElement;

      terminal.fill(0, 0, 2, 1, "A", { fg: "blue" });
      terminal.fill(2, 0, 2, 1, "B", { fg: "red" });
      terminal.commit({ planes: ["default"], sync: true });

      expect(line.childNodes[0]).toBe(firstSpan);
      expect(line.childNodes[1]).toBe(secondSpan);
      expect(firstSpan.style.color).toBe("var(--vt-color-blue)");
      expect(secondSpan.style.color).toBe("var(--vt-color-red)");
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 0,
        segmentReuseRows: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("invalidates the opt-in row prepass when href changes", () => {
    const { terminal, container, renderer } = setup(3, 1, { enableRowKeyPrepass: true });

    try {
      terminal.fill(0, 0, 3, 1, "A", { href: "https://example.com/a" });
      terminal.commit({ planes: ["default"], sync: true });

      terminal.fill(0, 0, 3, 1, "A", { href: "https://example.com/b" });
      terminal.commit({ planes: ["default"], sync: true });

      expect(lineEl(container).textContent).toBe("AAA");
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 0,
        rowKeyPrepassChecks: 1,
        rowKeyPrepassHits: 0,
        rowKeyPrepassMisses: 1,
        fragmentRows: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });

  it("invalidates the row cache when a plain row becomes wide", () => {
    const { terminal, container, renderer } = setup(2, 1, { enableRowKeyPrepass: true });

    try {
      terminal.fill(0, 0, 2, 1, "A");
      terminal.commit({ planes: ["default"], sync: true });

      terminal.write("中", { x: 0, y: 0 });
      terminal.commit({ planes: ["default"], sync: true });

      const line = lineEl(container);
      expect(line.firstChild).toBeInstanceOf(HTMLSpanElement);
      expect(line.textContent).toContain("中");
      expect(lastRowStats(renderer)).toMatchObject({
        rows: 1,
        cacheHits: 0,
        rowKeyPrepassChecks: 1,
        rowKeyPrepassHits: 0,
        rowKeyPrepassMisses: 1,
        fragmentRows: 1,
      });
    } finally {
      renderer.dispose();
      container.remove();
    }
  });
});
