import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitepress";

function shim(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}

export default defineConfig({
  lang: "zh-CN",
  title: "Vue TUI",
  description: "Vue 3 terminal UI toolkit for browser DOM and CLI stdout renderers",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    [
      "meta",
      {
        name: "keywords",
        content:
          "Vue, Vue 3, terminal UI, TUI, CLI, stdout renderer, DOM renderer, ANSI, markdown, virtual list, log viewer",
      },
    ],
    ["meta", { property: "og:title", content: "Vue TUI" }],
    [
      "meta",
      {
        property: "og:description",
        content: "Vue 3 terminal UI toolkit for browser DOM and CLI stdout renderers.",
      },
    ],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { name: "twitter:card", content: "summary" }],
  ],
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
      { text: "Examples", link: "/examples" },
      { text: "Agent Console", link: "/agent-console" },
      { text: "TLogView Lab", link: "/tlog-view-lab" },
      { text: "Planes", link: "/planes-and-compositor" },
      { text: "扩展性", link: "/extensibility" },
      { text: "API Maturity", link: "/api-maturity" },
      { text: "组件 API（生成）", link: "/generated/components-api" },
      {
        text: "GitHub",
        items: [
          { text: "Repository", link: "https://github.com/Simon-He95/vue-tui" },
          { text: "Issues", link: "https://github.com/Simon-He95/vue-tui/issues" },
          {
            text: "New issue",
            link: "https://github.com/Simon-He95/vue-tui/issues/new/choose",
          },
        ],
      },
    ],
    sidebar: [
      {
        text: "开始",
        items: [
          { text: "概览", link: "/" },
          { text: "Live Showcase", link: "/showcase" },
          { text: "组件（概览）", link: "/components" },
          { text: "Examples Index", link: "/examples" },
          { text: "Agent Console", link: "/agent-console" },
          { text: "TLogView Lab", link: "/tlog-view-lab" },
          { text: "组件 API（生成）", link: "/generated/components-api" },
          { text: "核心 API", link: "/api" },
          { text: "API Maturity", link: "/api-maturity" },
          { text: "Platform Contracts", link: "/platform-contracts" },
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
          { text: "Platform Contracts", link: "/platform-contracts" },
          { text: "Planes 与 Compositor", link: "/planes-and-compositor" },
          { text: "Terminal Compatibility", link: "/terminal-compatibility" },
          { text: "Performance", link: "/performance" },
          { text: "高吞吐渲染", link: "/high-throughput-rendering" },
          { text: "Observability", link: "/observability" },
          { text: "0.x Release Candidate", link: "/release-candidate" },
          { text: "TLogView Release Readiness", link: "/tlog-view-release-readiness" },
        ],
      },
      {
        text: "验收",
        items: [
          { text: "Overflow", link: "/overflow" },
          { text: "Examples Index", link: "/examples" },
          { text: "0.x Release Candidate", link: "/release-candidate" },
        ],
      },
    ],
    editLink: {
      pattern: "https://github.com/Simon-He95/vue-tui/edit/main/docs/:path",
      text: "在 GitHub 上编辑此页",
    },
    footer: {
      message:
        "Bug reports, feature requests, and documentation issues are tracked on GitHub Issues.",
      copyright: "Released under the MIT License.",
    },
    socialLinks: [{ icon: "github", link: "https://github.com/Simon-He95/vue-tui" }],
  },
});
