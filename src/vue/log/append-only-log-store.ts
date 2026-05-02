import type { AppendOnlyLogStore, CreateAppendOnlyLogStoreOptions } from "./types.js";
import { ref } from "vue";

type StoredLine = {
  id: number;
  text: string;
};

function normalizeMaxLines(value: unknown): number | null {
  if (value == null) return null;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.max(1, n);
}

export function createAppendOnlyLogStore(
  options?: CreateAppendOnlyLogStoreOptions,
): AppendOnlyLogStore {
  const lines: StoredLine[] = [];
  const version = ref(0);
  const maxLines = normalizeMaxLines(options?.maxLines);
  let head = 0;
  let firstLineIndex = 0;
  let tail = "";
  let tailVersion = 0;
  let nextLineId = 0;

  function bump(): void {
    version.value++;
  }

  function retainedCompletedCount(): number {
    return lines.length - head;
  }

  function retainedLineCount(): number {
    return retainedCompletedCount() + (tail ? 1 : 0);
  }

  function completedAt(index: number): StoredLine | undefined {
    return lines[head + index];
  }

  function pushLine(text: string): void {
    lines.push({ id: nextLineId++, text });
  }

  function maybeCompact(): void {
    if (head < 4096) return;
    if (head * 2 < lines.length) return;
    lines.splice(0, head);
    head = 0;
  }

  function enforceRetention(): void {
    if (maxLines == null) return;

    const overflow = retainedLineCount() - maxLines;
    if (overflow <= 0) return;

    const dropped = Math.min(overflow, retainedCompletedCount());
    if (dropped <= 0) return;

    head += dropped;
    firstLineIndex += dropped;
    maybeCompact();
  }

  return {
    source: {
      lineCount: () => retainedLineCount(),
      firstLineIndex: () => firstLineIndex,
      getLine(index) {
        const completedCount = retainedCompletedCount();
        if (index >= 0 && index < completedCount) return completedAt(index)?.text ?? "";
        if (index === completedCount && tail) return tail;
        return "";
      },
      getLineKey(index) {
        const completedCount = retainedCompletedCount();
        if (index >= 0 && index < completedCount)
          return completedAt(index)?.id ?? `missing:${firstLineIndex}:${index}`;
        if (index === completedCount && tail) return `tail:${tailVersion}`;
        return `empty:${firstLineIndex}:${index}`;
      },
    },
    version,
    appendLine(line) {
      if (tail) {
        pushLine(tail + line);
        tail = "";
        tailVersion++;
      } else {
        pushLine(line);
      }
      enforceRetention();
      bump();
    },
    appendLines(nextLines) {
      if (nextLines.length === 0) return;
      let start = 0;
      if (tail) {
        pushLine(tail + (nextLines[0] ?? ""));
        tail = "";
        tailVersion++;
        start = 1;
      }
      for (let i = start; i < nextLines.length; i++) pushLine(nextLines[i] ?? "");
      enforceRetention();
      bump();
    },
    appendChunk(chunk) {
      if (!chunk) return;
      const parts = chunk.replace(/\r/g, "").split("\n");
      tail += parts[0] ?? "";
      for (let i = 1; i < parts.length; i++) {
        pushLine(tail);
        tail = parts[i] ?? "";
      }
      tailVersion++;
      enforceRetention();
      bump();
    },
    replaceTail(text) {
      tail = text.replace(/[\r\n]/g, "");
      tailVersion++;
      enforceRetention();
      bump();
    },
    clear() {
      lines.length = 0;
      head = 0;
      firstLineIndex = 0;
      tail = "";
      tailVersion++;
      bump();
    },
  };
}
