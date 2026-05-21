import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createStdinDriver } from "../src/cli.js";
import {
  createTerminalApp,
  defineComponent,
  h,
  mountTerminal,
  nextTick,
  TLink,
} from "./ui-regressions-support";

class FakeStdin extends EventEmitter {
  isTTY = true;
  setEncoding(_enc: string) {}
  setRawMode(_value: boolean) {}
  resume() {}
}

class FakeStdout {
  isTTY = true;
  write(_value: string) {}
}

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

  it("does not open when click handler prevents default", async () => {
    const opener = vi.fn(() => true);
    const onActivate = vi.fn();
    const onClick = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "https://example.com",
          label: "Example",
          onActivate,
          onClick,
        }),
      20,
      2,
      { linkOpener: opener },
    );

    try {
      const click = new MouseEvent("click", {
        clientX: 0,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      });
      mounted.container()!.dispatchEvent(click);
      await Promise.resolve();

      expect(click.defaultPrevented).toBe(true);
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onActivate).not.toHaveBeenCalled();
      expect(opener).not.toHaveBeenCalled();
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

  it("does not open when keydown handler prevents default", async () => {
    const opener = vi.fn(() => true);
    const onActivate = vi.fn();
    const onKeydown = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "mailto:test@example.com",
          label: "Mail",
          onActivate,
          onKeydown,
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
      expect(onKeydown).toHaveBeenCalledTimes(1);
      expect(onActivate).not.toHaveBeenCalled();
      expect(opener).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("uses host opener for native keyboard activation", async () => {
    const opener = vi.fn(() => true);
    const onOpen = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "https://example.com",
          label: "Example",
          openMode: "native",
          onOpen,
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

      expect(event.defaultPrevented).toBe(false);
      expect(opener).toHaveBeenCalledWith("https://example.com/", {
        source: "key",
        label: "Example",
        cellX: undefined,
        cellY: undefined,
      });
      expect(onOpen).toHaveBeenCalledWith({
        href: "https://example.com/",
        label: "Example",
        source: "key",
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
      await nextTick();
      await Promise.resolve();

      expect(mounted.terminal.getCell(0, 0).style.href).toBe("/docs");

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

  it("prevents native DOM link activation when host mode opens", async () => {
    const opener = vi.fn(() => true);
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "https://example.com",
          label: "Example",
          openMode: "host",
          modifierClick: "none",
        }),
      20,
      2,
      { domRendererOptions: { links: true }, linkOpener: opener },
    );

    try {
      await nextTick();
      await Promise.resolve();

      const anchor = mounted.container()!.querySelector("a");
      expect(anchor?.getAttribute("href")).toBe("https://example.com/");

      const click = new MouseEvent("click", {
        clientX: 1,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      });
      expect(anchor!.dispatchEvent(click)).toBe(false);
      await Promise.resolve();

      expect(click.defaultPrevented).toBe(true);
      expect(opener).toHaveBeenCalledTimes(1);
    } finally {
      mounted.unmount();
    }
  });

  it("allows native DOM click activation when native mode modifier passes", async () => {
    const opener = vi.fn(() => true);
    const onActivate = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "https://example.com",
          label: "Example",
          openMode: "native",
          modifierClick: "ctrlOrMeta",
          onActivate,
        }),
      20,
      2,
      { domRendererOptions: { links: true }, linkOpener: opener },
    );

    try {
      await nextTick();
      await Promise.resolve();

      const anchor = mounted.container()!.querySelector("a");
      expect(anchor?.getAttribute("href")).toBe("https://example.com/");

      const click = new MouseEvent("click", {
        clientX: 1,
        clientY: 0,
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
      });
      expect(anchor!.dispatchEvent(click)).toBe(true);
      await Promise.resolve();

      expect(click.defaultPrevented).toBe(false);
      expect(onActivate).toHaveBeenCalledWith({
        href: "https://example.com/",
        label: "Example",
        source: "click",
      });
      expect(opener).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("lets renderer-level event activation win over host mode", async () => {
    const opener = vi.fn(() => true);
    const rendererActivate = vi.fn();
    const onActivate = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "https://example.com",
          label: "Example",
          openMode: "host",
          onActivate,
        }),
      20,
      2,
      {
        domRendererOptions: {
          links: { activation: "event", onActivate: rendererActivate },
        },
        linkOpener: opener,
      },
    );

    try {
      await nextTick();
      await Promise.resolve();

      const anchor = mounted.container()!.querySelector("a");
      expect(anchor?.getAttribute("href")).toBe("https://example.com/");

      const click = new MouseEvent("click", {
        clientX: 1,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      });
      expect(anchor!.dispatchEvent(click)).toBe(false);
      await Promise.resolve();

      expect(click.defaultPrevented).toBe(true);
      expect(rendererActivate).toHaveBeenCalledWith("https://example.com/", click);
      expect(onActivate).not.toHaveBeenCalled();
      expect(opener).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("suppresses native DOM link activation before modifier click passes", async () => {
    const opener = vi.fn(() => true);
    const onActivate = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "https://example.com",
          label: "Example",
          modifierClick: "ctrlOrMeta",
          onActivate,
        }),
      20,
      2,
      { domRendererOptions: { links: true }, linkOpener: opener },
    );

    try {
      await nextTick();
      await Promise.resolve();

      const anchor = mounted.container()!.querySelector("a");
      expect(anchor?.getAttribute("href")).toBe("https://example.com/");

      const click = new MouseEvent("click", {
        clientX: 1,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      });
      expect(anchor!.dispatchEvent(click)).toBe(false);
      await Promise.resolve();

      expect(click.defaultPrevented).toBe(true);
      expect(onActivate).not.toHaveBeenCalled();
      expect(opener).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("does not render href metadata in none mode", async () => {
    const opener = vi.fn(() => true);
    const onActivate = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "https://example.com",
          label: "Example",
          openMode: "none",
          onActivate,
        }),
      20,
      2,
      { domRendererOptions: { links: true }, linkOpener: opener },
    );

    try {
      await nextTick();
      await Promise.resolve();

      expect(mounted.terminal.getCell(0, 0).style.href).toBeUndefined();
      expect(mounted.container()!.querySelector("a")).toBeNull();

      mounted
        .container()!
        .dispatchEvent(
          new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true, cancelable: true }),
        );
      await Promise.resolve();

      expect(onActivate).not.toHaveBeenCalled();
      expect(opener).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it("does not apply hover or active styles in none mode", async () => {
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "https://example.com",
          label: "Example",
          openMode: "none",
          style: { fg: "white" },
          hoverStyle: { fg: "redBright" },
          activeStyle: { bg: "blue" },
        }),
      20,
      2,
    );

    try {
      await nextTick();
      await Promise.resolve();

      expect(mounted.terminal.getCell(0, 0).style.fg).toBe("white");

      mounted
        .container()!
        .dispatchEvent(new MouseEvent("mousemove", { clientX: 0, clientY: 0, bubbles: true }));
      mounted.container()!.dispatchEvent(
        new MouseEvent("pointerdown", {
          clientX: 0,
          clientY: 0,
          bubbles: true,
          cancelable: true,
        }),
      );
      await nextTick();
      await Promise.resolve();

      const style = mounted.terminal.getCell(0, 0).style;
      expect(style.fg).toBe("white");
      expect(style.bg).toBeUndefined();
    } finally {
      mounted.unmount();
    }
  });

  it("emits open for the default browser opener when window.open returns null", async () => {
    const win = (globalThis as any).window as {
      open?: (url?: string, target?: string, features?: string) => unknown;
    };
    const originalOpen = win.open;
    const open = vi.fn(() => null);
    win.open = open;
    const onOpen = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "https://browser.example",
          label: "Browser",
          onOpen,
        }),
      20,
      2,
    );

    try {
      mounted
        .container()!
        .dispatchEvent(
          new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true, cancelable: true }),
        );
      await Promise.resolve();

      expect(open).toHaveBeenCalledWith(
        "https://browser.example/",
        "_blank",
        "noopener,noreferrer",
      );
      expect(onOpen).toHaveBeenCalledWith({
        href: "https://browser.example/",
        label: "Browser",
        source: "click",
      });
    } finally {
      if (originalOpen) win.open = originalOpen;
      else delete win.open;
      mounted.unmount();
    }
  });

  it("does not emit open when linkOpener returns false", async () => {
    const cases = [vi.fn(() => false), vi.fn(() => Promise.resolve(false))];

    for (const opener of cases) {
      const onOpen = vi.fn();
      const mounted = await mountTerminal(
        () =>
          h(TLink, {
            x: 0,
            y: 0,
            href: "https://example.com",
            label: "Example",
            onOpen,
          }),
        20,
        2,
        { linkOpener: opener },
      );

      try {
        mounted.container()!.dispatchEvent(
          new MouseEvent("click", {
            clientX: 0,
            clientY: 0,
            bubbles: true,
            cancelable: true,
          }),
        );
        await Promise.resolve();
        await Promise.resolve();

        expect(opener).toHaveBeenCalled();
        expect(onOpen).not.toHaveBeenCalled();
      } finally {
        mounted.unmount();
      }
    }
  });

  it("ignores linkOpener errors without leaking unhandled failures", async () => {
    const cases = [
      vi.fn(() => {
        throw new Error("blocked");
      }),
      vi.fn(() => Promise.reject(new Error("blocked"))),
    ];

    for (const opener of cases) {
      const onOpen = vi.fn();
      const mounted = await mountTerminal(
        () =>
          h(TLink, {
            x: 0,
            y: 0,
            href: "https://example.com",
            label: "Example",
            onOpen,
          }),
        20,
        2,
        { linkOpener: opener },
      );

      try {
        expect(() => {
          mounted.container()!.dispatchEvent(
            new MouseEvent("click", {
              clientX: 0,
              clientY: 0,
              bubbles: true,
              cancelable: true,
            }),
          );
        }).not.toThrow();
        await Promise.resolve();
        await Promise.resolve();

        expect(opener).toHaveBeenCalled();
        expect(onOpen).not.toHaveBeenCalled();
      } finally {
        mounted.unmount();
      }
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

  it("rejects file hrefs at the TLink boundary", async () => {
    const opener = vi.fn(() => true);
    const onInvalidHref = vi.fn();
    const mounted = await mountTerminal(
      () =>
        h(TLink, {
          x: 0,
          y: 0,
          href: "file:///tmp/a",
          label: "File",
          onInvalidHref,
        }),
      20,
      2,
      { domRendererOptions: { links: true }, linkOpener: opener },
    );

    try {
      await nextTick();
      await Promise.resolve();

      expect(mounted.terminal.getCell(0, 0).style.href).toBeUndefined();
      expect(mounted.container()!.querySelector("a")).toBeNull();

      mounted
        .container()!
        .dispatchEvent(
          new MouseEvent("click", { clientX: 0, clientY: 0, bubbles: true, cancelable: true }),
        );
      await Promise.resolve();

      expect(onInvalidHref).toHaveBeenCalledWith({
        href: "file:///tmp/a",
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

  it("uses only ctrl from ctrlOrMeta on real CLI mouse input", async () => {
    for (const testCase of [
      { modifierClick: "ctrlOrMeta", opens: true },
      { modifierClick: "meta", opens: false },
    ] as const) {
      const opener = vi.fn(() => true);
      const App = defineComponent({
        name: "TLinkCliModifierTest",
        setup() {
          return () =>
            h(TLink, {
              x: 0,
              y: 0,
              href: "https://cli.example",
              label: "CLI",
              modifierClick: testCase.modifierClick,
            });
        },
      });
      const app = createTerminalApp({
        cols: 20,
        rows: 2,
        component: App,
        linkOpener: opener,
      });
      const stdin = new FakeStdin() as any;
      const stdout = new FakeStdout() as any;
      const driver = createStdinDriver({
        stdin,
        stdout,
        dispatch: (event) => app.events.dispatch(event),
        enableMouse: false,
      });

      try {
        app.mount();
        await nextTick();
        app.scheduler.flushNow();

        stdin.emit("data", "\u001B[<16;1;1M\u001B[<19;1;1m");
        await Promise.resolve();

        if (testCase.opens) {
          expect(opener).toHaveBeenCalledWith("https://cli.example/", {
            source: "click",
            label: "CLI",
            cellX: 0,
            cellY: 0,
          });
        } else {
          expect(opener).not.toHaveBeenCalled();
        }
      } finally {
        driver.dispose();
        app.dispose();
      }
    }
  });
});
