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

export type Osc52ClipboardOptions = Readonly<{
  target?: string;
  supported?: boolean;
  maxBytes?: number;
  write?: (sequence: string) => void | Promise<void>;
  readText?: () => Promise<string>;
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
    const supported =
      typeof navigator !== "undefined" &&
      !!(navigator as any).clipboard?.writeText &&
      !!(navigator as any).clipboard?.readText;
    return {
      supported,
      async readText() {
        if (!supported) throw new Error("Clipboard not available in this runtime");
        return (navigator as any).clipboard.readText();
      },
      async writeText(text: string) {
        if (!supported) throw new Error("Clipboard not available in this runtime");
        await (navigator as any).clipboard.writeText(text);
      },
    };
  }

  return createUnsupportedClipboard();
}

function base64EncodeBytes(bytes: Uint8Array): string {
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    out += table[(triple >> 18) & 63] ?? "";
    out += table[(triple >> 12) & 63] ?? "";
    out += i + 1 < bytes.length ? (table[(triple >> 6) & 63] ?? "") : "=";
    out += i + 2 < bytes.length ? (table[triple & 63] ?? "") : "=";
  }
  return out;
}

function encodeTextBytes(text: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
  const bin = unescape(encodeURIComponent(text));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function createOsc52ClipboardProvider(options: Osc52ClipboardOptions = {}): ClipboardApi {
  const stdout = (globalThis as any).process?.stdout;
  const write =
    options.write ??
    ((sequence: string) => {
      stdout?.write?.(sequence);
    });
  const supported = options.supported ?? Boolean(options.write || (stdout?.write && stdout.isTTY));
  const target = options.target ?? "c";

  return {
    supported,
    async readText() {
      if (!options.readText) throw new Error("Clipboard read not available in this runtime");
      return options.readText();
    },
    async writeText(text: string) {
      if (!supported) throw new Error("Clipboard not available in this runtime");
      const bytes = encodeTextBytes(text);
      const maxBytes = options.maxBytes ?? 100 * 1024;
      if (bytes.byteLength > maxBytes)
        throw new Error(`OSC52 clipboard payload too large: ${bytes.byteLength} bytes`);
      await write(`\u001B]52;${target};${base64EncodeBytes(bytes)}\u0007`);
    },
  };
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
