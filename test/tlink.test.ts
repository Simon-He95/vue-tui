import { describe, expect, it, vi } from "vitest";
import {
  createTerminalApp,
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  TLink,
} from "./ui-regressions-support";

describe("TLink", () => {
  it("renders link text with href metadata and opens through TerminalProvider linkOpener", async () => {
    const opener = vi.fn(() => true);
    const onActivate = vi.fn();
    const onOpen = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "https://example.com",
          label: "Example",
          onActivate,
          onOpen,
        }),
      20,
      2,
      { linkOpener: opener },
    );

    try {
      await nextTick();
      await Promise.resolve();

      expect(mounted.terminal.snapshot().lines[0]).toContain("Example");
      expect(mounted.terminal.getCell(0, 0).style.href).toBe("https://example.com/");

      mounted
        .container()!
        .dispatchEvent(
          new MouseEvent("click", { clientX: 1, clientY: 0, bubbles: true, cancelable: true }),
        );
      await Promise.resolve();

      expect(onActivate).toHaveBeenCalledWith({
        href: "https://example.com/",
        label: "Example",
        source: "click",
      });
      expect(opener).toHaveBeenCalledWith("https://example.com/", {
        source: "click",
        label: "Example",
        cellX: 1,
        cellY: 0,
      });
      expect(onOpen).toHaveBeenCalledWith({
        href: "https://example.com/",
        label: "Example",
        source: "click",
      });
    } finally {
      mounted.unmount();
    }
  });

  it("supports keyboard activation when focused", async () => {
    const opener = vi.fn(() => true);
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "mailto:test@example.com",
          label: "Mail",
        }),
      20,
      2,
      { linkOpener: opener },
    );

    try {
      const container = mounted.container()!;
      container.dispatchEvent(
        new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
      );

      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(event);
      await Promise.resolve();

      expect(event.defaultPrevented).toBe(true);
      expect(opener).toHaveBeenCalledWith("mailto:test@example.com", {
        source: "key",
        label: "Mail",
        cellX: undefined,
        cellY: undefined,
      });
    } finally {
      mounted.unmount();
    }
  });

  it("emits activation without opening in event mode", async () => {
    const opener = vi.fn(() => true);
    const onActivate = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "/docs",
          label: "Docs",
          openMode: "event",
          onActivate,
        }),
      20,
      2,
      { linkOpener: opener },
    );

    try {
      mounted
        .container()!
        .dispatchEvent(
          new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true, cancelable: true }),
        );
      await Promise.resolve();

      expect(onActivate).toHaveBeenCalledWith({
        href: "/docs",
        label: "Docs",
        source: "click",
      });
      expect(opener).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("reports unsafe hrefs without rendering or opening them", async () => {
    const opener = vi.fn(() => true);
    const onInvalidHref = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "javascript:alert(1)",
          label: "Bad",
          onInvalidHref,
        }),
      20,
      2,
      { linkOpener: opener },
    );

    try {
      await nextTick();
      await Promise.resolve();

      expect(mounted.terminal.getCell(0, 0).style.href).toBeUndefined();

      mounted
        .container()!
        .dispatchEvent(
          new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true, cancelable: true }),
        );
      await Promise.resolve();

      expect(onInvalidHref).toHaveBeenCalledWith({
        href: "javascript:alert(1)",
        reason: "unsafe href",
      });
      expect(opener).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("uses createTerminalApp linkOpener for CLI events", async () => {
    const opener = vi.fn(() => true);
    const App = defineComponent({
      name: "TLinkCliTest",
      setup() {
        return () => h(TLink, { x: 0, y: 0, href: "https://cli.example", label: "CLI" });
      },
    });
    const app = createTerminalApp({
      cols: 20,
      rows: 2,
      component: App,
      linkOpener: opener,
    });

    try {
      app.mount();
      await nextTick();
      app.scheduler.flushNow();

      expect(app.terminal.snapshot().lines[0]).toContain("CLI");
      expect(app.terminal.getCell(0, 0).style.href).toBe("https://cli.example/");

      app.events.dispatch({ type: "pointerdown", cellX: 0, cellY: 0, button: 0 });
      app.events.dispatch({ type: "click", cellX: 0, cellY: 0, button: 0 });
      await Promise.resolve();

      expect(opener).toHaveBeenCalledWith("https://cli.example/", {
        source: "click",
        label: "CLI",
        cellX: 0,
        cellY: 0,
      });
    } finally {
      app.dispose();
    }
  });
});
