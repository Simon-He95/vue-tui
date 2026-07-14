const MARKDOWN_PUBLICATION_TASK_ID = "AgentConsoleSurface:markdown-publication";

type AgentConsoleMode = "log" | "markdown";

type MarkdownPublicationScheduler = Readonly<{
  queueFrameTask: (task: {
    id: string;
    reason: "stream";
    priority: "low";
    sync: false;
    run: () => void;
  }) => boolean | void;
  cancelFrameTask?: (id: string) => boolean | void;
}>;

type TimerHandle = ReturnType<typeof setTimeout>;

export function createMarkdownPublicationController(options: {
  scheduler: MarkdownPublicationScheduler;
  getMode: () => AgentConsoleMode;
  syncMarkdownBlocks: () => void;
  minPublicationIntervalMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
}) {
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  const minInterval = options.minPublicationIntervalMs ?? 0;
  let lastPublicationAt = Number.NEGATIVE_INFINITY;
  let publicationVersion = 0;
  let pendingFrame = false;
  let pendingTimer: TimerHandle | undefined;
  let dirty = false;
  let alive = true;

  function publish(): void {
    if (!dirty) return;
    dirty = false;
    options.syncMarkdownBlocks();
    lastPublicationAt = now();
  }

  function queuePublicationFrame(version: number): void {
    if (!alive || options.getMode() !== "markdown" || pendingFrame || !dirty) return;
    pendingFrame = true;
    const accepted = options.scheduler.queueFrameTask({
      id: MARKDOWN_PUBLICATION_TASK_ID,
      reason: "stream",
      priority: "low",
      sync: false,
      run: () => {
        if (
          !alive ||
          options.getMode() !== "markdown" ||
          version !== publicationVersion ||
          !pendingFrame
        )
          return;
        pendingFrame = false;
        publish();
        schedule();
      },
    });
    if (accepted === false) {
      pendingFrame = false;
      publish();
      schedule();
    }
  }

  function schedule(): void {
    if (
      !alive ||
      options.getMode() !== "markdown" ||
      !dirty ||
      pendingFrame ||
      pendingTimer != null
    )
      return;
    const version = publicationVersion;
    const elapsed = now() - lastPublicationAt;
    const remaining = Number.isFinite(lastPublicationAt) ? Math.max(0, minInterval - elapsed) : 0;
    if (remaining > 0) {
      pendingTimer = setTimer(() => {
        pendingTimer = undefined;
        if (!alive || options.getMode() !== "markdown" || version !== publicationVersion) return;
        queuePublicationFrame(version);
      }, remaining);
      return;
    }
    queuePublicationFrame(version);
  }

  function cancel(): void {
    publicationVersion++;
    dirty = false;
    pendingFrame = false;
    if (pendingTimer != null) {
      clearTimer(pendingTimer);
      pendingTimer = undefined;
    }
    options.scheduler.cancelFrameTask?.(MARKDOWN_PUBLICATION_TASK_ID);
  }

  function request(): void {
    if (!alive || options.getMode() !== "markdown") return;
    dirty = true;
    schedule();
  }

  function setMode(mode: AgentConsoleMode): void {
    cancel();
    if (mode === "markdown" && alive) {
      dirty = true;
      publish();
    }
  }

  function dispose(): void {
    alive = false;
    cancel();
  }

  return {
    request,
    setMode,
    cancel,
    dispose,
    isPending: () => pendingFrame || pendingTimer != null,
  };
}
