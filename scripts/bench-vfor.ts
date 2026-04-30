import { Window } from "happy-dom";

const itemCountArg = process.argv.slice(2).find((arg) => Number.isFinite(Number.parseInt(arg, 10)));
const N = Math.max(0, Number.parseInt(itemCountArg ?? "1000", 10) || 1000);
const cols = 80;
const rows = 24;

const win = new Window();
function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}

setGlobal("window", win);
setGlobal("document", win.document);
setGlobal("navigator", win.navigator);
setGlobal("Node", win.Node);
setGlobal("Element", win.Element);
setGlobal("HTMLElement", win.HTMLElement);
setGlobal("SVGElement", win.SVGElement);
setGlobal("Event", win.Event);
setGlobal("EventTarget", win.EventTarget);
setGlobal("CustomEvent", win.CustomEvent);
setGlobal("MouseEvent", win.MouseEvent);
setGlobal("KeyboardEvent", win.KeyboardEvent);
setGlobal("getComputedStyle", win.getComputedStyle.bind(win));

Object.defineProperty(globalThis, "requestAnimationFrame", {
  configurable: true,
  writable: true,
  value: (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  },
});
Object.defineProperty(globalThis, "cancelAnimationFrame", {
  configurable: true,
  writable: true,
  value: () => {},
});

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

const { createApp, defineComponent, h, nextTick, ref } = await import("vue");
const { TerminalProvider, TText, TView } = await import("../src/index.js");

const items = ref(Array.from({ length: N }, (_, i) => `item ${i}`));

const App = defineComponent({
  name: "BenchVFor",
  setup() {
    return () =>
      h(TerminalProvider, { cols, rows }, () =>
        h(TView, { x: 0, y: 0, w: cols, h: rows }, () =>
          items.value.map((s, i) => h(TText, { key: i, x: 0, y: i, w: cols, value: s })),
        ),
      );
  },
});

async function main(): Promise<void> {
  const el = document.createElement("div");
  document.body.appendChild(el);

  const t0 = now();
  const app = createApp(App);
  app.mount(el);
  await nextTick();
  const t1 = now();

  const iters = 10;
  const updateTimes: number[] = [];
  for (let k = 0; k < iters; k++) {
    const start = now();
    const next = items.value.slice();
    next[0] = `item 0 • ${k}`;
    items.value = next;
    await nextTick();
    updateTimes.push(now() - start);
  }

  const avg = updateTimes.reduce((a, b) => a + b, 0) / updateTimes.length;

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        items: N,
        cols,
        rows,
        mount_ms: Number((t1 - t0).toFixed(2)),
        update_avg_ms: Number(avg.toFixed(2)),
      },
      null,
      2,
    ),
  );

  app.unmount();
  el.remove();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
