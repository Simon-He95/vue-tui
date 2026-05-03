import type { Ref } from "vue";

export interface TLogDataSource {
  lineCount(): number;
  getLine(index: number): string;
  getLineKey?: (index: number) => string | number;
  firstLineIndex?: () => number;
}

export type CreateAppendOnlyLogStoreOptions = Readonly<{
  maxLines?: number;
}>;

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
  estimatedVisualRowCount: number;
  firstLineIndex?: number;
}>;
