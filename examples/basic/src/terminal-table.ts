import { createTerminalApp } from "@simon_he/vue-tui";
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
process.on("SIGINT", () => {
  terminal.dispose();
  process.exit(0);
});

process.on("SIGTERM", () => {
  terminal.dispose();
  process.exit(0);
});
