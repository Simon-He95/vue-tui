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

export function createMarkdownPublicationController(options: {
  scheduler: MarkdownPublicationScheduler;
  getMode: () => AgentConsoleMode;
  syncMarkdownBlocks: () => void;
}) {
  let publicationVersion = 0;
  let pending = false;
  let alive = true;
  function cancel(): void {
    publicationVersion++;
    pending = false;
    options.scheduler.cancelFrameTask?.(MARKDOWN_PUBLICATION_TASK_ID);
  }
  function request(): void {
    if (!alive || options.getMode() !== "markdown" || pending) return;
    pending = true;
    const version = ++publicationVersion;
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
          !pending
        )
          return;
        pending = false;
        options.syncMarkdownBlocks();
      },
    });
    if (accepted === false) {
      pending = false;
      options.syncMarkdownBlocks();
    }
  }
  function setMode(mode: AgentConsoleMode): void {
    cancel();
    if (mode === "markdown" && alive) options.syncMarkdownBlocks();
  }
  function dispose(): void {
    alive = false;
    cancel();
  }
  return { request, setMode, cancel, dispose, isPending: () => pending };
}
