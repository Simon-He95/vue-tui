export type CliLatencyStageEvent = Readonly<Record<string, unknown>> & {
  type?: unknown;
  key?: unknown;
  code?: unknown;
};

export type CliLatencyProfiler = Readonly<{
  enabled: true;
  recordRawInput: (info?: Readonly<{ bytes?: number }>) => void;
  recordStdinDispatch: (
    event: CliLatencyStageEvent,
    info?: Readonly<{ parser?: string | null }>,
  ) => void;
  recordEventDispatchStart: (event: CliLatencyStageEvent) => void;
  recordEventDispatchEnd: (
    event: CliLatencyStageEvent,
    info: Readonly<{ defaultPrevented: boolean }>,
  ) => void;
  recordSchedulerInvalidate: (
    info?: Readonly<{ priority?: string | null; plane?: string | null }>,
  ) => void;
  recordFlushStart: (
    info?: Readonly<{ sync?: boolean; activePlanes?: readonly string[] | null }>,
  ) => void;
  recordFlushEnd: () => void;
  recordCommit: (
    info?: Readonly<{
      sync?: boolean;
      dirtyRows?: readonly number[] | null;
      planes?: readonly string[] | null;
    }>,
  ) => void;
  recordStdoutQueued: (delayMs: number) => void;
  recordStdoutRenderStart: () => void;
  recordStdoutNoOutput: () => void;
  recordStdoutWrite: (
    info: Readonly<{
      durationMs: number;
      bytes: number;
      mode: string;
    }>,
  ) => void;
  markOperation: (operation: string) => void;
}>;
