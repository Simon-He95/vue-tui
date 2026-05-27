import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitepress";

function shim(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}

const siteUrl = "https://vue-tui.pages.dev";
const siteDescription =
  "Vue 3 terminal UI components and renderers for browser DOM, CLI stdout, logs, markdown transcripts, and agent consoles.";
const siteImage = new URL("/brand/vue-tui-logo-board-vector.png", siteUrl).href;

function pageUrl(page: string): string {
  const path = page.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "");
  return new URL(path ? `/${path}` : "/", `${siteUrl}/`).href;
}

export default defineConfig({
  lang: "zh-CN",
  title: "Vue TUI",
  description: siteDescription,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: siteUrl,
  },
  head: [
    ["link", { rel: "icon", href: "/brand/vue-tui-favicon.ico", sizes: "any" }],
    [
      "meta",
      {
        name: "keywords",
        content:
          "Vue, Vue 3, vue-tui, Vue terminal UI, Vue TUI, terminal UI components, TUI, CLI UI, stdout renderer, DOM terminal renderer, ANSI renderer, markdown transcript, virtual list, log viewer, agent console",
      },
    ],
    ["meta", { property: "og:title", content: "Vue TUI - Vue 3 terminal UI components" }],
    [
      "meta",
      {
        property: "og:description",
        content: siteDescription,
      },
    ],
    ["meta", { property: "og:site_name", content: "Vue TUI" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:image", content: siteImage }],
    ["meta", { property: "og:image:alt", content: "Vue TUI logo" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: "Vue TUI - Vue 3 terminal UI components" }],
    ["meta", { name: "twitter:description", content: siteDescription }],
    ["meta", { name: "twitter:image", content: siteImage }],
    ["meta", { name: "twitter:image:alt", content: "Vue TUI logo" }],
  ],
  transformHead({ page }) {
    const url = pageUrl(page);
    return [
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:url", content: url }],
    ];
  },
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
    logo: {
      light: "/brand/vue-tui-app-icon-light.svg",
      dark: "/brand/vue-tui-app-icon-dark.svg",
      alt: "Vue TUI",
    },
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
          { text: "Terminal UI Best Practices", link: "/terminal-ui-best-practices" },
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
          { text: "Terminal UI Best Practices", link: "/terminal-ui-best-practices" },
          { text: "Terminal Compatibility", link: "/terminal-compatibility" },
          { text: "Performance", link: "/performance" },
          { text: "Benchmarks", link: "/benchmarks" },
          { text: "OpenTUI Solid 对比", link: "/compare-opentui-solid" },
          { text: "高吞吐渲染", link: "/high-throughput-rendering" },
          { text: "Observability", link: "/observability" },
          { text: "1.0 Release Candidate", link: "/release-candidate" },
          { text: "TLogView Release Readiness", link: "/tlog-view-release-readiness" },
        ],
      },
      {
        text: "验收",
        items: [
          { text: "Overflow", link: "/overflow" },
          { text: "组件验收", link: "/components-acceptance" },
          { text: "Examples Index", link: "/examples" },
          { text: "1.0 Release Candidate", link: "/release-candidate" },
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
