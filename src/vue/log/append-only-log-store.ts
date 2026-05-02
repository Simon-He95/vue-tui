import type { AppendOnlyLogStore } from "./types.js";
import { ref } from "vue";

export function createAppendOnlyLogStore(): AppendOnlyLogStore {
  const lines: string[] = [];
  const version = ref(0);
  let tail = "";

  function bump(): void {
    version.value++;
  }

  return {
    source: {
      lineCount: () => lines.length + (tail ? 1 : 0),
      getLine(index) {
        if (index < lines.length) return lines[index] ?? "";
        if (index === lines.length) return tail;
        return "";
      },
    },
    version,
    appendLine(line) {
      if (tail) {
        lines.push(tail + line);
        tail = "";
      } else {
        lines.push(line);
      }
      bump();
    },
    appendLines(nextLines) {
      if (nextLines.length === 0) return;
      let start = 0;
      if (tail) {
        lines.push(tail + (nextLines[0] ?? ""));
        tail = "";
        start = 1;
      }
      for (let i = start; i < nextLines.length; i++) lines.push(nextLines[i] ?? "");
      bump();
    },
    appendChunk(chunk) {
      if (!chunk) return;
      const parts = chunk.replace(/\r/g, "").split("\n");
      tail += parts[0] ?? "";
      for (let i = 1; i < parts.length; i++) {
        lines.push(tail);
        tail = parts[i] ?? "";
      }
      bump();
    },
    replaceTail(text) {
      tail = text.replace(/[\r\n]/g, "");
      bump();
    },
    clear() {
      lines.length = 0;
      tail = "";
      bump();
    },
  };
}
