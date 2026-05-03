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

export type TLogViewVisualIndexStatus = "estimated" | "measuring" | "exact";

export type TLogViewVisualIndexOptions = Readonly<{
  /**
   * Max time spent measuring wrapped visual rows in one scheduler frame.
   * Default: 4ms.
   */
  measureBudgetMs?: number;

  /**
   * Optional retained-window cap for exact visual index work.
   * Undefined means measure the whole retained source window.
   */
  maxMeasuredLines?: number;
}>;

export type TLogViewScrollPayload = Readonly<{
  scrollTop: number;
  atBottom: boolean;
  lineCount: number;
  estimatedVisualRowCount: number;
  visualRowCount: number;
  measuredVisualRowCount: number;
  measuredLineCount: number;
  visualIndexStatus: TLogViewVisualIndexStatus;
  firstLineIndex?: number;
}>;
