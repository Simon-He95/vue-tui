import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitepress";

function shim(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}

export default defineConfig({
  lang: "zh-CN",
  title: "Vue TUI",
  description: "Vue 3 terminal UI component library",
  cleanUrls: true,
  lastUpdated: true,
  vite: {
    resolve: {
      alias: [
        {
          find: "node:fs/promises",
          replacement: shim("./shims/node-fs-promises.ts"),
        },
        { find: "node:buffer", replacement: shim("./shims/node-buffer.ts") },
        {
          find: "node:child_process",
          replacement: shim("./shims/node-child_process.ts"),
        },
        { find: "node:fs", replacement: shim("./shims/node-fs.ts") },
        { find: "node:path", replacement: shim("./shims/node-path.ts") },
        {
          find: "node:process",
          replacement: shim("./shims/node-process.ts"),
        },
        { find: "node:url", replacement: shim("./shims/node-url.ts") },
      ],
    },
  },
  themeConfig: {
    nav: [
      { text: "概览", link: "/" },
      { text: "Live Showcase", link: "/showcase" },
      { text: "组件", link: "/components" },
      { text: "TLogView Lab", link: "/tlog-view-lab" },
      { text: "Planes", link: "/planes-and-compositor" },
      { text: "扩展性", link: "/extensibility" },
      { text: "组件 API（生成）", link: "/generated/components-api" },
    ],
    sidebar: [
      {
        text: "开始",
        items: [
          { text: "概览", link: "/" },
          { text: "Live Showcase", link: "/showcase" },
          { text: "组件（概览）", link: "/components" },
          { text: "TLogView Lab", link: "/tlog-view-lab" },
          { text: "组件 API（生成）", link: "/generated/components-api" },
          { text: "核心 API", link: "/api" },
          { text: "Planes 与 Compositor", link: "/planes-and-compositor" },
          { text: "扩展性与插件化", link: "/extensibility" },
        ],
      },
      {
        text: "设计与规范",
        items: [
          { text: "Design System", link: "/design-system" },
          { text: "Runtime", link: "/runtime" },
          { text: "CLI Events", link: "/cli-events" },
          { text: "Planes 与 Compositor", link: "/planes-and-compositor" },
          { text: "Terminal Compatibility", link: "/terminal-compatibility" },
          { text: "Performance", link: "/performance" },
          { text: "高吞吐渲染", link: "/high-throughput-rendering" },
          { text: "Observability", link: "/observability" },
        ],
      },
      {
        text: "验收与评审",
        items: [
          { text: "Components Acceptance", link: "/components-acceptance" },
          { text: "Design Review", link: "/design-review" },
          { text: "Overflow", link: "/overflow" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/Simon-He95/vue-tui" }],
  },
});
