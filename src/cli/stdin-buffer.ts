import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";

const ESC = "\x1B";
const BRACKETED_PASTE_START = "\x1B[200~";
const BRACKETED_PASTE_END = "\x1B[201~";
const ESC_CONTINUATION_RESCUE_WINDOW_MS = 64;

function looksLikeQuotedPathPaste(value: string): boolean {
  if (!value) return false;
  if (value.includes(ESC)) return false;
  if (value.length < 12) return false;
  if (!/['"]/.test(value)) return false;
  if (!/[\\/]/.test(value)) return false;
  if (!/['"]\s*(?:~\/|\/|[A-Z]:[\\/]|\\\\)/i.test(value)) return false;
  const last = value[value.length - 1]!;
  if (last === "'" || last === '"' || /\s/.test(last)) return true;
  return false;
}

function isCompleteSequence(data: string): "complete" | "incomplete" | "not-escape" {
  if (!data.startsWith(ESC)) return "not-escape";

  if (data.length === 1) return "incomplete";

  const afterEsc = data.slice(1);

  if (afterEsc.startsWith("[")) {
    if (afterEsc.startsWith("[M")) return data.length >= 6 ? "complete" : "incomplete";
    return isCompleteCsiSequence(data);
  }

  if (afterEsc.startsWith("]")) return isCompleteOscSequence(data);

  if (afterEsc.startsWith("P")) return isCompleteDcsSequence(data);

  if (afterEsc.startsWith("_")) return isCompleteApcSequence(data);

  if (afterEsc.startsWith("O")) return afterEsc.length >= 2 ? "complete" : "incomplete";

  if (afterEsc.length === 1) return "complete";

  return "complete";
}

function isCompleteCsiSequence(data: string): "complete" | "incomplete" {
  if (!data.startsWith(`${ESC}[`)) return "complete";

  if (data.length < 3) return "incomplete";

  const payload = data.slice(2);
  const lastChar = payload[payload.length - 1]!;
  const lastCharCode = lastChar.charCodeAt(0);

  if (lastCharCode >= 0x40 && lastCharCode <= 0x7e) {
    if (payload.startsWith("<")) {
      if (/^<\d+;\d+;\d+M$/i.test(payload)) return "complete";
      if (lastChar === "M" || lastChar === "m") {
        const parts = payload.slice(1, -1).split(";");
        if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) return "complete";
      }
      return "incomplete";
    }
    return "complete";
  }

  return "incomplete";
}

function isCompleteOscSequence(data: string): "complete" | "incomplete" {
  if (!data.startsWith(`${ESC}]`)) return "complete";
  if (data.endsWith(`${ESC}\\`) || data.endsWith("\x07")) return "complete";
  return "incomplete";
}

function isCompleteDcsSequence(data: string): "complete" | "incomplete" {
  if (!data.startsWith(`${ESC}P`)) return "complete";
  if (data.endsWith(`${ESC}\\`)) return "complete";
  return "incomplete";
}

function isCompleteApcSequence(data: string): "complete" | "incomplete" {
  if (!data.startsWith(`${ESC}_`)) return "complete";
  if (data.endsWith(`${ESC}\\`)) return "complete";
  return "incomplete";
}

function extractCompleteSequences(buffer: string): {
  sequences: string[];
  remainder: string;
} {
  const sequences: string[] = [];
  let pos = 0;

  while (pos < buffer.length) {
    const remaining = buffer.slice(pos);

    if (remaining.startsWith(ESC)) {
      // If we see consecutive ESC bytes, treat the first as a standalone Escape key
      // rather than bundling them into an "unknown" escape sequence. This prevents
      // cases like: ESC (held key repeat) + ESC[<...M (mouse report) being split into
      // "ESC ESC" + "[<...M" which would leak mouse bytes as literal input.
      if (remaining.length >= 2 && remaining[1] === ESC) {
        sequences.push(ESC);
        pos += 1;
        continue;
      }

      let seqEnd = 1;
      while (seqEnd <= remaining.length) {
        const candidate = remaining.slice(0, seqEnd);
        const status = isCompleteSequence(candidate);

        if (status === "complete") {
          sequences.push(candidate);
          pos += seqEnd;
          break;
        }
        if (status === "incomplete") {
          seqEnd++;
          continue;
        }

        sequences.push(candidate);
        pos += seqEnd;
        break;
      }

      if (seqEnd > remaining.length) return { sequences, remainder: remaining };
    } else {
      sequences.push(remaining[0]!);
      pos++;
    }
  }

  return { sequences, remainder: "" };
}

function looksLikeSplitEscapeContinuation(value: string): boolean {
  const first = value[0];
  if (first !== "[" && first !== "]" && first !== "P" && first !== "_" && first !== "O") {
    return false;
  }
  return isCompleteSequence(`${ESC}${value}`) !== "not-escape";
}

export interface StdinBufferOptions {
  timeout?: number;
  /**
   * Flush timeout used specifically when the buffer contains only a lone ESC.
   *
   * Terminals send many escape sequences (CSI/OSC/SGR mouse) that start with ESC,
   * but stream chunking can split the leading ESC from the rest of the sequence.
   * Using a slightly longer timeout for a lone ESC reduces cases where ESC is
   * emitted as a standalone key and the remaining bytes leak as literal input.
   */
  escTimeout?: number;
}

export interface StdinBufferEventMap {
  data: [string];
  paste: [string];
}

export class StdinBuffer extends EventEmitter<StdinBufferEventMap> {
  private buffer = "";
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private readonly timeoutMs: number;
  private readonly escTimeoutMs: number;
  private pendingEscContinuationAt: number | null = null;
  private pasteMode = false;
  private pasteBuffer = "";

  constructor(options: StdinBufferOptions = {}) {
    super();
    this.timeoutMs = options.timeout ?? 10;
    this.escTimeoutMs = options.escTimeout ?? Math.max(this.timeoutMs, 100);
  }

  public process(data: string | Buffer): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    let str: string;
    if (Buffer.isBuffer(data)) {
      if (data.length === 1 && data[0]! > 127) {
        const byte = data[0]! - 128;
        str = `\x1B${String.fromCharCode(byte)}`;
      } else {
        str = data.toString();
      }
    } else {
      str = data;
    }

    if (this.pendingEscContinuationAt != null) {
      const canRescue =
        Date.now() - this.pendingEscContinuationAt <= ESC_CONTINUATION_RESCUE_WINDOW_MS;
      this.pendingEscContinuationAt = null;
      if (canRescue && looksLikeSplitEscapeContinuation(str)) str = `${ESC}${str}`;
    }

    if (str.length === 0 && this.buffer.length === 0) {
      this.emit("data", "");
      return;
    }

    this.buffer += str;

    if (this.pasteMode) {
      this.pasteBuffer += this.buffer;
      this.buffer = "";

      const endIndex = this.pasteBuffer.indexOf(BRACKETED_PASTE_END);
      if (endIndex !== -1) {
        const pastedContent = this.pasteBuffer.slice(0, endIndex);
        const remaining = this.pasteBuffer.slice(endIndex + BRACKETED_PASTE_END.length);

        this.pasteMode = false;
        this.pasteBuffer = "";

        this.emit("paste", pastedContent);

        if (remaining.length > 0) this.process(remaining);
      }
      return;
    }

    const startIndex = this.buffer.indexOf(BRACKETED_PASTE_START);
    if (startIndex !== -1) {
      if (startIndex > 0) {
        const beforePaste = this.buffer.slice(0, startIndex);
        const result = extractCompleteSequences(beforePaste);
        for (const sequence of result.sequences) this.emit("data", sequence);
      }

      this.buffer = this.buffer.slice(startIndex + BRACKETED_PASTE_START.length);
      this.pasteMode = true;
      this.pasteBuffer = this.buffer;
      this.buffer = "";

      const endIndex = this.pasteBuffer.indexOf(BRACKETED_PASTE_END);
      if (endIndex !== -1) {
        const pastedContent = this.pasteBuffer.slice(0, endIndex);
        const remaining = this.pasteBuffer.slice(endIndex + BRACKETED_PASTE_END.length);

        this.pasteMode = false;
        this.pasteBuffer = "";

        this.emit("paste", pastedContent);

        if (remaining.length > 0) this.process(remaining);
      }
      return;
    }

    if (looksLikeQuotedPathPaste(this.buffer)) {
      const payload = this.buffer;
      this.buffer = "";
      this.emit("paste", payload);
      return;
    }

    const result = extractCompleteSequences(this.buffer);
    this.buffer = result.remainder;

    for (const sequence of result.sequences) this.emit("data", sequence);

    if (this.buffer.length > 0) {
      const timeoutMs = this.buffer === ESC ? this.escTimeoutMs : this.timeoutMs;
      this.timeout = setTimeout(() => {
        const rescuableLoneEsc = this.buffer === ESC;
        const flushed = this.flush();
        if (rescuableLoneEsc && flushed.length === 1 && flushed[0] === ESC)
          this.pendingEscContinuationAt = Date.now();
        for (const sequence of flushed) this.emit("data", sequence);
      }, timeoutMs);
    }
  }

  public flush(): string[] {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.buffer.length === 0) return [];

    const sequences = [this.buffer];
    this.buffer = "";
    return sequences;
  }

  public clear(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.buffer = "";
    this.pendingEscContinuationAt = null;
    this.pasteMode = false;
    this.pasteBuffer = "";
  }

  public getBuffer(): string {
    return this.buffer;
  }

  public destroy(): void {
    this.clear();
  }
}
