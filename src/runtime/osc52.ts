import type { ClipboardApi } from "./index.js";

export type Osc52ClipboardOptions = Readonly<{
  target?: string;
  supported?: boolean;
  maxBytes?: number;
  write?: (sequence: string) => void | Promise<void>;
  readText?: () => Promise<string>;
}>;

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

function normalizeOsc52Target(value: unknown): string {
  const raw = String(value ?? "c").trim();
  return /^[cpsq0-7]+$/i.test(raw) ? raw : "c";
}

function resolveMaxBytes(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

export function createOsc52ClipboardProvider(options: Osc52ClipboardOptions = {}): ClipboardApi {
  const stdout = (globalThis as any).process?.stdout;
  const write =
    options.write ??
    ((sequence: string) => {
      stdout?.write?.(sequence);
    });
  const canWrite = options.supported ?? Boolean(options.write || (stdout?.write && stdout.isTTY));
  const canRead = typeof options.readText === "function";
  const target = normalizeOsc52Target(options.target);

  return {
    supported: canWrite,
    canRead,
    canWrite,
    async readText() {
      if (!canRead) throw new Error("Clipboard read not available in this runtime");
      return options.readText();
    },
    async writeText(text: string) {
      if (!canWrite) throw new Error("Clipboard not available in this runtime");
      const bytes = encodeTextBytes(text);
      const maxBytes = resolveMaxBytes(options.maxBytes, 100 * 1024);
      if (bytes.byteLength > maxBytes)
        throw new Error(`OSC52 clipboard payload too large: ${bytes.byteLength} bytes`);
      await write(`\u001B]52;${target};${base64EncodeBytes(bytes)}\u0007`);
    },
  };
}
