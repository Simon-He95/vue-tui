/**
 * 选中复制动态开关验证脚本。
 *
 * 运行方式（在仓库根目录）：
 *   bun run examples/selection-toggle-demo.ts
 *
 * 功能：
 *   - 用 OSC52 clipboard 开启终端选区，松开鼠标自动复制到本地剪贴板。
 *   - 按 `c` 动态切换 autoCopy（保留选区高亮，只是松开不再自动复制）。
 *   - 按 `s` 动态切换选区高亮样式。
 *   - 按 `q` / Ctrl+C 退出。
 *
 * 验证要点：
 *   1. autoCopy 开启时，拖选文字松开 → 终端剪贴板被写入（终端里可粘贴验证）。
 *   2. autoCopy 关闭时，拖选仍会高亮，但松开不复制。
 *   3. 切换样式后，拖选的高亮颜色立刻变化。
 *   4. 在支持 Shift+drag 原生选区的终端（iTerm2/Ghostty/Kitty/WezTerm）按住 Shift 拖选，
 *      走终端原生选区，不受本脚本影响。
 *
 * 说明：headless renderer 不会因 Vue ref 变更而重渲染组件（这是 vue-tui 的设计：
 * 渲染由 scheduler.flush 驱动 render-node 的 paint，而非 Vue 响应式 patch）。
 * 因此状态栏直接用 terminal.write 写 buffer，按键时手动覆写，不依赖 Vue 响应式。
 */
import {
  createOsc52ClipboardProvider,
  createStdinDriver,
  createStdoutRenderer,
  createTerminalApp,
  installTerminalCleanup,
  type TerminalCleanupHandle,
} from "@simon_he/vue-tui/cli";
import { TText, TView } from "@simon_he/vue-tui";
import { defineComponent, h } from "vue";
import type { Style } from "@simon_he/vue-tui/core";

const cols = Number.isFinite(process.stdout.columns) ? process.stdout.columns : 72;
const rows = Number.isFinite(process.stdout.rows) ? process.stdout.rows : 20;

const LINES = [
  "The quick brown fox jumps over the lazy dog.",
  "Vue-TUI selection + OSC52 copy demo.",
  "Drag-select any line above, then release.",
  "Press c to toggle autoCopy, s to cycle style, q to quit.",
];

const STYLES: { name: string; style: Style }[] = [
  { name: "inverse       ", style: { inverse: true } },
  { name: "blk on magenta", style: { fg: "black", bg: "magentaBright", inverse: false } },
  { name: "blk on cyan   ", style: { fg: "black", bg: "cyanBright", inverse: false } },
];

const STATUS_Y = LINES.length + 2;

// 动态状态（不用 Vue ref，直接操作 terminal buffer）
let autoCopy = true;
let mouseCapture = true; // 跟踪 mouse capture 状态（和 autoCopy 联动）
let styleIndex = 0;
let toastText = "";

const App = defineComponent({
  name: "SelectionToggleDemo",
  setup() {
    return () =>
      h(TView, { x: 0, y: 0, w: cols, h: rows, selectable: true }, () => [
        h(TText, {
          x: 1,
          y: 0,
          value: "Selection Toggle Demo",
          style: { fg: "cyanBright", bold: true },
        }),
        ...LINES.map((line, i) =>
          h(TText, { x: 2, y: 1 + i, value: line, style: { fg: "whiteBright" } }),
        ),
        // 状态栏占位行（内容由 paintStatusBar 直接写 terminal buffer）
        h(TText, { x: 1, y: STATUS_Y, value: "", style: { dim: true } }),
      ]);
  },
});

const app = createTerminalApp({
  cols,
  rows,
  component: App as any,
  clipboard: createOsc52ClipboardProvider(),
  selection: true,
});

app.selection.onCopy((payload) => {
  toastText = `last copy: ok=${payload.ok} ${payload.rows}L ${payload.chars}ch`;
  paintStatusBar();
  app.scheduler.flushNow();
  // 一段时间后清掉 toast
  setTimeout(() => {
    toastText = "";
    paintStatusBar();
    app.scheduler.flushNow();
  }, 2000);
});

app.mount();

const out = createStdoutRenderer(app.terminal, {
  output: process.stdout,
  hideCursor: true,
  trackResize: false,
  defaultBg: "black",
});

app.scheduler.flush();

/** 直接把状态栏写到 terminal buffer，绕过 Vue 响应式重渲染 */
function paintStatusBar(): void {
  const mode = mouseCapture
    ? `autoCopy: ${autoCopy ? "ON " : "OFF"}`
    : "NATIVE (mouse capture OFF)";
  const text = `${mode}  |  style: ${STYLES[styleIndex]!.name}  |  ${toastText || "—"}`;
  app.terminal.write(text, { x: 1, y: STATUS_Y, style: { dim: true } });
}

let driver: ReturnType<typeof createStdinDriver> | null = null;
let cleanupHandle: TerminalCleanupHandle | null = null;
let exiting = false;

const applyConfig = (): void => {
  app.selection.setConfig({
    autoCopy,
    style: STYLES[styleIndex]!.style,
  });
  paintStatusBar();
  app.scheduler.flushNow();
};
applyConfig();

const cleanup = (): void => {
  if (exiting) return;
  exiting = true;
  cleanupHandle?.uninstall();
  cleanupHandle = null;
  driver?.dispose();
  out.dispose();
  app.dispose();
};

const exit = (): void => {
  cleanup();
  process.exit(0);
};

cleanupHandle = installTerminalCleanup(cleanup, { signalPolicy: "exit" });

driver = createStdinDriver({
  dispatch: (e) => {
    const ev = e as { type: string; key?: string; ctrlKey?: boolean };
    if (ev.type === "keydown") {
      if (ev.key === "q") {
        exit();
        return true;
      }
      if (ev.key === "c" && !ev.ctrlKey) {
        // 联动切换：autoCopy + mouse capture
        // ON  → TUI 选区 + 松开自动复制（OSC52）
        // OFF → 关 mouse capture，终端原生选区/右键菜单恢复
        mouseCapture = !mouseCapture;
        autoCopy = mouseCapture;
        driver?.setMouseCapture?.(mouseCapture);
        applyConfig();
        return true;
      }
      if (ev.key === "s") {
        styleIndex = (styleIndex + 1) % STYLES.length;
        applyConfig();
        return true;
      }
      if (ev.key === "c" && ev.ctrlKey) {
        exit();
        return true;
      }
    }
    const prevented = app.events.dispatch(e);
    app.scheduler.flushNow();
    return prevented;
  },
  enableMouse: true,
  onExit: exit,
});

process.stderr.write(
  [
    "",
    "=== Selection Toggle Demo ===",
    "  c         toggle: OSC52 autoCopy  ↔  NATIVE (mouse capture off, right-click works)",
    "  s         cycle selection highlight style",
    "  q/Ctrl+C  quit",
    "",
  ].join("\n") + "\n",
);
