export type RuntimeEnv = "browser" | "terminal" | "unknown";

export type TimerApi = Readonly<{
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
}>;

export type RafApi = Readonly<{
  request: (cb: FrameRequestCallback) => number;
  cancel: (id: number) => void;
}>;

export type ClipboardApi = Readonly<{
  supported: boolean;
  readText: () => Promise<string>;
  writeText: (text: string) => Promise<void>;
}>;

export type RuntimeOptions = Readonly<{
  clipboard?: ClipboardApi;
}>;

export type Runtime = Readonly<{
  env: Readonly<{ kind: RuntimeEnv; isBrowser: boolean; isTerminal: boolean }>;
  now: () => number;
  timer: TimerApi;
  raf: RafApi;
  clipboard: ClipboardApi;
  getWindow: () => Window | null;
  getDocument: () => Document | null;
  measureText: (text: string, opts?: Readonly<{ font?: string }>) => number | null;
}>;

function isNodeLike(): boolean {
  const proc = (globalThis as any).process;
  return typeof proc?.versions?.node === "string";
}

function detectEnv(): RuntimeEnv {
  const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  if (isBrowser) return "browser";
  if (isNodeLike()) return "terminal";
  return "unknown";
}

function createUnsupportedClipboard(): ClipboardApi {
  return {
    supported: false,
    async readText() {
      throw new Error("Clipboard not available in this runtime");
    },
    async writeText() {
      throw new Error("Clipboard not available in this runtime");
    },
  };
}

function createClipboard(kind: RuntimeEnv): ClipboardApi {
  if (kind === "browser") {
    const clipboard = typeof navigator !== "undefined" ? (navigator as any).clipboard : undefined;
    const canRead = typeof clipboard?.readText === "function";
    const canWrite = typeof clipboard?.writeText === "function";

    return {
      supported: canRead || canWrite,
      async readText() {
        if (!canRead) throw new Error("Clipboard read not available in this runtime");
        return clipboard.readText();
      },
      async writeText(text: string) {
        if (!canWrite) throw new Error("Clipboard write not available in this runtime");
        await clipboard.writeText(text);
      },
    };
  }

  return createUnsupportedClipboard();
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function createRaf(kind: RuntimeEnv, timer: TimerApi): RafApi {
  const g: any = globalThis as any;
  if (
    kind === "browser" &&
    typeof g.requestAnimationFrame === "function" &&
    typeof g.cancelAnimationFrame === "function"
  ) {
    return {
      request: (cb) => g.requestAnimationFrame(cb),
      cancel: (id) => g.cancelAnimationFrame(id),
    };
  }

  return {
    request(cb) {
      return timer.setTimeout(() => cb(nowMs()), 16) as any;
    },
    cancel(id) {
      timer.clearTimeout(id as any);
    },
  };
}

function createMeasureText(kind: RuntimeEnv): Runtime["measureText"] {
  if (kind !== "browser") return () => null;

  return (text, opts) => {
    try {
      const doc = typeof document !== "undefined" ? document : null;
      if (!doc || !("createElement" in doc)) return null;
      const canvas = doc.createElement("canvas") as any;
      const ctx = canvas?.getContext?.("2d") as CanvasRenderingContext2D | null;
      if (!ctx) return null;
      if (opts?.font) ctx.font = opts.font;
      const m = ctx.measureText(text);
      return typeof m.width === "number" && Number.isFinite(m.width) ? m.width : null;
    } catch {
      return null;
    }
  };
}

export function createRuntime(
  kind: RuntimeEnv = detectEnv(),
  options: RuntimeOptions = {},
): Runtime {
  const timer: TimerApi = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  };

  const env = Object.freeze({
    kind,
    isBrowser: kind === "browser",
    isTerminal: kind === "terminal",
  });

  return {
    env,
    now() {
      return nowMs();
    },
    timer,
    raf: createRaf(kind, timer),
    clipboard: options.clipboard ?? createClipboard(kind),
    getWindow() {
      return env.isBrowser && typeof window !== "undefined" ? window : null;
    },
    getDocument() {
      return env.isBrowser && typeof document !== "undefined" ? document : null;
    },
    measureText: createMeasureText(kind),
  };
}
