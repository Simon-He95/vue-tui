import { fileURLToPath } from "node:url";
import {
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
  type TerminalCleanupHandle,
} from "@simon_he/vue-tui/cli";
import {
  createFfmpegVideoFrameSource,
  createYtDlpVideoFrameSource,
} from "@simon_he/vue-tui/experimental/video/node";
import TerminalShowcase from "./TerminalShowcase.vue";
import {
  showcaseAnsiPalette,
  showcaseTerminalStyle,
  type ShowcaseThemeMode,
} from "./showcase-theme";

const cols = Number.isFinite(process.stdout.columns) ? process.stdout.columns : 70;
const rows = Number.isFinite(process.stdout.rows) ? process.stdout.rows : 22;
const initialThemeMode: ShowcaseThemeMode = "dark";
const videoAsset = "video-demo.mp4";
const localVideoSrc = fileURLToPath(new URL(videoAsset, import.meta.url));
const youtubeVideoSrc = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
const youtubeDemo = /^(1|true|yes|on)$/iu.test(process.env.VUE_TUI_YOUTUBE_DEMO ?? "");
const videoSrc = youtubeDemo ? youtubeVideoSrc : localVideoSrc;
const videoFrameSource = youtubeDemo
  ? createYtDlpVideoFrameSource({
      ytDlpPath: process.env.YT_DLP_PATH,
      ffmpegPath: process.env.FFMPEG_PATH,
      maxSourceHeight: 720,
    })
  : createFfmpegVideoFrameSource({
      ffmpegPath: process.env.FFMPEG_PATH,
    });
let out!: ReturnType<typeof createStdoutRenderer>;

const app = createTerminalApp({
  cols,
  rows,
  component: TerminalShowcase as any,
  props: {
    videoSrc,
    videoFrameSource,
    onThemeChange: (mode: ShowcaseThemeMode) => {
      out?.updateTheme?.({ defaultBg: "black", palette: showcaseAnsiPalette(mode) });
    },
  },
  defaultStyle: showcaseTerminalStyle(initialThemeMode),
});
app.mount();

const smoke = process.env.VT_SMOKE === "1";
const rendererTheme = {
  defaultBg: "black",
  palette: showcaseAnsiPalette(initialThemeMode),
  colorMode: "truecolor" as const,
};
out = createStdoutRenderer(
  app.terminal,
  smoke
    ? {
        output: { write: () => {} },
        clear: false,
        hideCursor: false,
        altScreen: false,
        ...rendererTheme,
      }
    : {
        output: process.stdout,
        hideCursor: true,
        allowFileUrls: true,
        trackResize: false,
        ...rendererTheme,
      },
);

// Keep cursor position updated (even while hidden) so terminals that need it for composition
// can anchor IME near the active input.
const offCommitCursor = app.terminal.on("commit", () => {
  if (smoke) return;
  const anchor = app.getImeAnchor();
  if (anchor) {
    out.setCursor(anchor.cellX, anchor.cellY);
    out.showCursor(false);
  }
});

app.scheduler.flush();

let driver: ReturnType<typeof createStdinDriver> | null = null;
let cleanupHandle: TerminalCleanupHandle | null = null;
let exiting = false;

const onResize = () => {
  const nextCols = Number.isFinite(process.stdout.columns) ? process.stdout.columns : cols;
  const nextRows = Number.isFinite(process.stdout.rows) ? process.stdout.rows : rows;
  app.terminal.resize(nextCols, nextRows);
  // Resize invalidation flushes on the scheduler's next frame after Vue layout effects update.
};

const cleanup = () => {
  if (exiting) return;
  exiting = true;
  if (process.stdout.isTTY) process.stdout.off("resize", onResize);
  cleanupHandle?.uninstall();
  cleanupHandle = null;
  driver?.dispose();
  offCommitCursor();
  out.dispose();
  app.dispose();
};

const exit = () => {
  cleanup();
  process.exit(0);
};

if (process.stdout.isTTY) {
  process.stdout.on("resize", onResize);
}

if (smoke) {
  exit();
} else {
  cleanupHandle = installTerminalCleanup(cleanup, { signalPolicy: "exit" });
  driver = createStdinDriver({
    dispatch: (e) => {
      const prevented = app.events.dispatch(e);
      app.scheduler.flush();
      return prevented;
    },
    enableMouse: true,
    onExit: exit,
  });
}
