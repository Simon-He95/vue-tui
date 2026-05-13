import { createTerminalApp, installTerminalCleanup } from "@simon_he/vue-tui/cli";
import TableDemo from "./TableDemo.vue";

const { app, terminal } = createTerminalApp({
  cols: 60,
  rows: 16,
  defaultStyle: { fg: "whiteBright" },
  renderComponent: TableDemo,
});

// 启动终端
app.start?.();

// 处理退出
installTerminalCleanup(() => terminal.dispose());
