import type { Ref } from "vue";

export interface TLogDataSource {
  lineCount(): number;
  getLine(index: number): string;
}

export type AppendOnlyLogStore = Readonly<{
  source: TLogDataSource;
  version: Ref<number>;
  appendLine: (line: string) => void;
  appendLines: (lines: readonly string[]) => void;
  appendChunk: (chunk: string) => void;
  replaceTail: (text: string) => void;
  clear: () => void;
}>;

export type TLogViewScrollPayload = Readonly<{
  scrollTop: number;
  atBottom: boolean;
  lineCount: number;
}>;
