import type { AppendOnlyLogStore } from "./types.js";
import { ref } from "vue";

type StoredLine = {
  id: number;
  text: string;
};

export function createAppendOnlyLogStore(): AppendOnlyLogStore {
  const lines: StoredLine[] = [];
  const version = ref(0);
  let tail = "";
  let tailVersion = 0;
  let nextLineId = 0;

  function bump(): void {
    version.value++;
  }

  function pushLine(text: string): void {
    lines.push({ id: nextLineId++, text });
  }

  return {
    source: {
      lineCount: () => lines.length + (tail ? 1 : 0),
      getLine(index) {
        if (index < lines.length) return lines[index]?.text ?? "";
        if (index === lines.length) return tail;
        return "";
      },
      getLineKey(index) {
        if (index < lines.length) return lines[index]?.id ?? `missing:${index}`;
        if (index === lines.length && tail) return `tail:${tailVersion}`;
        return `empty:${index}`;
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
      bump();
    },
    replaceTail(text) {
      tail = text.replace(/[\r\n]/g, "");
      tailVersion++;
      bump();
    },
    clear() {
      lines.length = 0;
      tail = "";
      tailVersion++;
      bump();
    },
  };
}
