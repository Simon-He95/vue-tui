import { fileURLToPath, URL } from "node:url";
import { defineConfig, type HeadConfig } from "vitepress";

function shim(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}

const siteUrl = "https://vue-tui.pages.dev";
const siteName = "Vue TUI";
const siteDescription =
  "Vue 3 terminal UI components and renderers for browser DOM, CLI stdout, logs, markdown transcripts, and agent consoles.";
const siteImage = new URL("/brand/vue-tui-logo-board-vector.png", siteUrl).href;

const pageMeta: Record<
  string,
  {
    title: string;
    description: string;
    keywords?: string;
    schemaType?: "SoftwareSourceCode" | "TechArticle";
  }
> = {
  "index.md": {
    title: "Vue TUI - Vue 3 Terminal UI Components",
    description:
      "Build terminal-style Vue 3 interfaces for browser DOM, CLI stdout, logs, markdown transcripts, virtual lists, and agent consoles.",
    keywords:
      "Vue terminal UI, Vue TUI, Vue CLI UI, terminal components, stdout renderer, DOM terminal renderer, agent console",
    schemaType: "SoftwareSourceCode",
  },
  "showcase.md": {
    title: "Vue Terminal UI Live Showcase",
    description:
      "Explore live Vue TUI components rendered in browser DOM, including layout, forms, overlays, logs, markdown, and agent console surfaces.",
    keywords: "Vue terminal UI demo, browser terminal UI, Vue TUI components, terminal dashboard",
  },
  "components.md": {
    title: "Vue Terminal UI Components",
    description:
      "Reference for Vue TUI components such as TerminalProvider, TBox, TInput, TList, TTable, TLogView, TVirtualMarkdown, and agent primitives.",
    keywords:
      "Vue terminal components, TUI components, Vue CLI components, terminal UI component library",
  },
  "agent-console.md": {
    title: "Agent Console UI for Vue",
    description:
      "Build AI agent console UIs with Vue 3, streaming markdown, tool-call status, logs, links, overlays, search, and CLI stdout support.",
    keywords:
      "agent console UI, AI agent terminal, Vue agent console, markdown transcript, tool call UI",
  },
  "performance.md": {
    title: "Vue TUI Performance Guide",
    description:
      "Performance guidance for high-throughput terminal UIs, virtual lists, append-only logs, dirty rows, renderer caching, and streaming transcripts.",
    keywords:
      "terminal UI performance, Vue TUI performance, virtual list performance, append-only log renderer",
  },
  "benchmarks.md": {
    title: "Vue TUI Benchmarks",
    description:
      "Benchmark scope, budgets, sample results, and comparison boundaries for Vue TUI renderers, virtual lists, logs, and agent console scenarios.",
    keywords:
      "Vue TUI benchmarks, terminal UI benchmarks, DOM renderer benchmark, stdout renderer benchmark",
  },
  "compare-opentui-solid.md": {
    title: "Vue TUI vs OpenTUI Solid",
    description:
      "Compare Vue TUI with OpenTUI Solid by product fit, runtime target, browser DOM support, CLI rendering path, and benchmark claim boundaries.",
    keywords: "OpenTUI Solid alternative, Vue TUI comparison, Vue terminal UI, Solid terminal UI",
  },
  "guide/vue-terminal-ui.md": {
    title: "Vue Terminal UI Components",
    description:
      "Build terminal-style Vue 3 interfaces with shared components for browser DOM, CLI stdout, and headless tests.",
    keywords: "Vue terminal UI, Vue TUI, terminal components, browser terminal UI",
  },
  "guide/vue-cli-ui.md": {
    title: "Vue CLI UI Components",
    description:
      "Build real CLI interfaces with Vue component composition, terminal events, stdout rendering, dialogs, lists, inputs, and overlays.",
    keywords: "Vue CLI UI, Vue terminal CLI, CLI component library, terminal UI components",
  },
  "guide/cli-stdout-renderer.md": {
    title: "CLI Stdout Renderer for Vue",
    description:
      "Use Vue TUI's stdout renderer to render Vue component trees into real terminals with ANSI output, input events, cleanup, and headless tests.",
    keywords: "stdout renderer, Vue stdout renderer, CLI stdout UI, terminal renderer",
  },
  "guide/terminal-log-viewer.md": {
    title: "Terminal Log Viewer for Vue",
    description:
      "Build high-throughput terminal log viewers with Vue TUI, append-only stores, retained windows, search, links, wrapping, and virtualized rows.",
    keywords: "terminal log viewer, Vue log viewer, append-only logs, TLogView, virtual logs",
  },
  "guide/markdown-transcript.md": {
    title: "Markdown Transcript UI for Vue",
    description:
      "Render streaming markdown transcripts in terminal-style Vue UIs with TVirtualMarkdown, markdown block sources, links, code blocks, and agent output.",
    keywords:
      "markdown transcript, streaming markdown, Vue markdown renderer, terminal markdown UI",
  },
};

function pageUrl(page: string): string {
  const path = page.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "");
  return new URL(path ? `/${path}` : "/", `${siteUrl}/`).href;
}

function jsonLd(meta: (typeof pageMeta)[string], url: string): HeadConfig {
  const base = {
    "@context": "https://schema.org",
    "@type": meta.schemaType ?? "TechArticle",
    "@id": `${url}#primary`,
    name: meta.title,
    description: meta.description,
    url,
    isPartOf: {
      "@type": "WebSite",
      name: siteName,
      url: siteUrl,
    },
  };

  return [
    "script",
    { type: "application/ld+json" },
    JSON.stringify(
      meta.schemaType === "SoftwareSourceCode"
        ? {
            ...base,
            codeRepository: "https://github.com/Simon-He95/vue-tui",
            programmingLanguage: "TypeScript",
            runtimePlatform: ["Browser DOM", "Node.js CLI stdout"],
            license: "https://github.com/Simon-He95/vue-tui/blob/main/license",
          }
        : base,
    ),
  ];
}

export default defineConfig({
  lang: "zh-CN",
  title: siteName,
  description: siteDescription,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: siteUrl,
    lastmodDateOnly: false,
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
    ["meta", { property: "og:title", content: pageMeta["index.md"].title }],
    ["meta", { property: "og:description", content: siteDescription }],
    ["meta", { property: "og:site_name", content: siteName }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:image", content: siteImage }],
    ["meta", { property: "og:image:alt", content: "Vue TUI logo" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: pageMeta["index.md"].title }],
    ["meta", { name: "twitter:description", content: siteDescription }],
    ["meta", { name: "twitter:image", content: siteImage }],
    ["meta", { name: "twitter:image:alt", content: "Vue TUI logo" }],
  ],
  transformPageData(pageData) {
    const meta = pageMeta[pageData.relativePath];
    if (!meta) return;

    pageData.title = meta.title;
    pageData.description = meta.description;
  },
  transformHead({ page, title, description }) {
    const meta = pageMeta[page] ?? {
      title,
      description,
      schemaType: "TechArticle" as const,
    };
    const url = pageUrl(page);
    const head: HeadConfig[] = [
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:url", content: url }],
      ["meta", { property: "og:title", content: meta.title }],
      ["meta", { property: "og:description", content: meta.description }],
      ["meta", { name: "twitter:title", content: meta.title }],
      ["meta", { name: "twitter:description", content: meta.description }],
      jsonLd(meta, url),
    ];

    if (meta.keywords) {
      head.push(["meta", { name: "keywords", content: meta.keywords }]);
    }

    return head;
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
      {
        text: "Guides",
        items: [
          { text: "Vue Terminal UI", link: "/guide/vue-terminal-ui" },
          { text: "Vue CLI UI", link: "/guide/vue-cli-ui" },
          { text: "CLI Stdout Renderer", link: "/guide/cli-stdout-renderer" },
          { text: "Terminal Log Viewer", link: "/guide/terminal-log-viewer" },
          { text: "Markdown Transcript", link: "/guide/markdown-transcript" },
        ],
      },
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
          { text: "Vue Terminal UI", link: "/guide/vue-terminal-ui" },
          { text: "Vue CLI UI", link: "/guide/vue-cli-ui" },
          { text: "CLI Stdout Renderer", link: "/guide/cli-stdout-renderer" },
          { text: "Terminal Log Viewer", link: "/guide/terminal-log-viewer" },
          { text: "Markdown Transcript", link: "/guide/markdown-transcript" },
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
