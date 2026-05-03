import { createApp, h } from "vue";
import { TerminalProvider } from "../../src/index.js";
import { TLOG_VIEW_LAB_LAYOUT, TLogViewLabApp } from "./App.js";

createApp({
  name: "TLogViewLabBrowserEntry",
  render() {
    return h(
      TerminalProvider,
      {
        cols: TLOG_VIEW_LAB_LAYOUT.cols,
        rows: TLOG_VIEW_LAB_LAYOUT.rows,
        defaultStyle: { fg: "whiteBright" },
      },
      {
        default: () => h(TLogViewLabApp),
      },
    );
  },
}).mount("#app");
