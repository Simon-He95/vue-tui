import { fileURLToPath, URL } from "node:url";
import { defineConfig, type HeadConfig } from "vitepress";

function shim(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}

const siteUrl = "https://vue-tui.pages.dev";
const siteName = "Vue TUI";
const packageName = "@simon_he/vue-tui";
const npmUrl = "https://www.npmjs.com/package/@simon_he/vue-tui";
const githubUrl = "https://github.com/Simon-He95/vue-tui";
const siteDescription =
  "Vue 3 terminal UI components and renderers for browser DOM, CLI stdout, logs, markdown transcripts, and agent consoles.";
const siteImage = new URL("/brand/vue-tui-logo-board-vector.png", siteUrl).href;
const showcaseImage = new URL("/showcase-themes/showcase-dark.png", siteUrl).href;

const pageMeta: Record<
  string,
  {
    title: string;
    description: string;
    keywords?: string;
    image?: string;
    imageAlt?: string;
    imageWidth?: string;
    imageHeight?: string;
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
    image: showcaseImage,
    imageAlt: "Vue TUI live showcase terminal component themes",
    imageWidth: "1280",
    imageHeight: "720",
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
  "benchmarks/results/2026-05-25-darwin-arm64-node23.11.0.md": {
    title: "Vue TUI Benchmark Result - Darwin arm64 Node 23.11.0",
    description:
      "Recorded Vue TUI benchmark result for Darwin arm64 on Node 23.11.0, including renderer, virtual list, log, and agent console scenarios.",
    keywords: "Vue TUI benchmark result, terminal UI benchmark data, Darwin arm64 Node benchmark",
  },
  "compare-opentui-solid.md": {
    title: "Vue TUI vs OpenTUI Solid",
    description:
      "Compare Vue TUI with OpenTUI Solid by product fit, runtime target, browser DOM support, CLI rendering path, and benchmark claim boundaries.",
    keywords: "OpenTUI Solid alternative, Vue TUI comparison, Vue terminal UI, Solid terminal UI",
  },
  "examples.md": {
    title: "Vue TUI Examples",
    description:
      "Run browser and terminal examples for Vue TUI, including basic components, agent console surfaces, TLogView, and packed package smoke checks.",
    keywords: "Vue TUI examples, Vue terminal examples, terminal UI demo, CLI UI examples",
  },
  "design-system.md": {
    title: "Vue TUI Design System",
    description:
      "Theme tokens, component defaults, and showcase presets for making Vue terminal interfaces consistent across browser and CLI surfaces.",
    keywords: "Vue TUI design system, terminal UI themes, TUI component styling",
  },
  "observability.md": {
    title: "Vue TUI Observability",
    description:
      "Monitor Vue TUI frame performance, renderer timings, dirty rows, trace events, and component-level perf data.",
    keywords: "Vue TUI observability, terminal UI performance monitoring, frame perf, dirty rows",
  },
  "api.md": {
    title: "Vue TUI Core API",
    description:
      "Core API reference for Vue TUI terminal creation, buffers, renderers, components, markdown, events, and link handling.",
    keywords: "Vue TUI API, terminal UI API, Vue terminal renderer API, TUI components API",
  },
  "api-maturity.md": {
    title: "Vue TUI API Maturity",
    description:
      "Public, advanced, experimental, and internal API boundaries for the Vue TUI package and its entrypoints.",
    keywords: "Vue TUI package contract, API maturity, TypeScript package exports",
  },
  "runtime.md": {
    title: "Vue TUI Runtime",
    description:
      "Runtime wiring for Vue TUI apps, including TerminalProvider, host boundaries, selection, clipboard, and renderer integration.",
    keywords: "Vue TUI runtime, TerminalProvider, terminal renderer runtime, CLI runtime",
  },
  "cli-events.md": {
    title: "Vue TUI CLI Events",
    description:
      "Keyboard, mouse, wheel, and terminal event contracts for Vue TUI CLI and browser renderer hosts.",
    keywords: "Vue TUI events, terminal keyboard events, CLI mouse events, TUI input events",
  },
  "platform-contracts.md": {
    title: "Vue TUI Platform Contracts",
    description:
      "Browser, CLI, and package boundary contracts for Vue TUI host permissions, links, clipboard, paths, and renderer behavior.",
    keywords: "Vue TUI platform contracts, terminal host permissions, browser CLI renderer",
  },
  "planes-and-compositor.md": {
    title: "Vue TUI Render Planes",
    description:
      "How Vue TUI render planes, layers, compositor behavior, dirty rows, and overlays work across terminal surfaces.",
    keywords: "Vue TUI render planes, terminal compositor, dirty row rendering, TRenderPlane",
  },
  "high-throughput-rendering.md": {
    title: "High-Throughput Vue Terminal Rendering",
    description:
      "Implementation notes for high-throughput Vue TUI rendering, frame coalescing, virtual rows, append-only logs, and renderer caches.",
    keywords:
      "high throughput terminal rendering, Vue TUI performance, virtual rows, append-only logs",
  },
  "terminal-ui-best-practices.md": {
    title: "Terminal UI Best Practices",
    description:
      "Practical guidance for building terminal Vue interfaces with stable focus, events, cell layout, styling, and renderer boundaries.",
    keywords: "terminal UI best practices, Vue terminal UI, CLI UI design, TUI accessibility",
  },
  "terminal-compatibility.md": {
    title: "Vue TUI Terminal Compatibility",
    description:
      "Terminal compatibility notes for Vue TUI color modes, ANSI output, CLI rendering, and host terminal capabilities.",
    keywords: "terminal compatibility, ANSI color, Vue TUI CLI, terminal renderer",
  },
  "components-acceptance.md": {
    title: "Vue TUI Component Acceptance",
    description:
      "Acceptance checks for Vue TUI components, package exports, docs generation, browser regressions, and public props/events.",
    keywords: "Vue TUI component tests, component acceptance, terminal component QA",
  },
  "overflow.md": {
    title: "Vue TUI Overflow Behavior",
    description:
      "Overflow and clipping behavior for Vue TUI terminal components, layouts, buffers, and renderer output.",
    keywords: "terminal UI overflow, Vue TUI clipping, TUI layout overflow",
  },
  "extensibility.md": {
    title: "Vue TUI Extensibility",
    description:
      "Extension points for Vue TUI components, renderers, plugins, host integrations, and CLI/browser package boundaries.",
    keywords: "Vue TUI plugins, terminal UI extensibility, renderer extension points",
  },
  "tlog-view-lab.md": {
    title: "Vue TUI TLogView Lab",
    description:
      "TLogView lab scenarios for retained logs, search, links, minimap, append-only stores, and terminal log viewer behavior.",
    keywords: "TLogView, terminal log viewer, Vue log viewer, append-only logs",
  },
  "tlog-view-release-readiness.md": {
    title: "TLogView Release Readiness",
    description:
      "Release readiness checklist for Vue TUI TLogView, benchmarks, package exports, docs, and agent console smoke tests.",
    keywords: "TLogView release readiness, Vue TUI release checks, terminal log viewer QA",
  },
  "generated/components-api.md": {
    title: "Vue TUI Generated Component API",
    description:
      "Generated props and events reference for Vue TUI components including TerminalProvider, TBox, TInput, TDialog, tables, logs, and markdown.",
    keywords: "Vue TUI component API, terminal component props, TBox TInput TDialog API",
  },
  "release-candidate.md": {
    title: "Vue TUI Release Candidate",
    description:
      "Release candidate validation process for Vue TUI package publishing, npm dist-tags, smoke tests, benchmarks, and docs builds.",
    keywords: "Vue TUI release candidate, npm package release, TypeScript package validation",
  },
  "release-notes-1.0.0.md": {
    title: "Vue TUI 1.0 Release Notes",
    description:
      "Release notes for Vue TUI 1.0 covering package entrypoints, renderer contracts, CLI runtime boundaries, markdown APIs, and validation.",
    keywords: "Vue TUI release notes, terminal UI package, Vue package release",
  },
  "migration-1.0.0-rc.0.md": {
    title: "Vue TUI 1.0 RC Migration",
    description:
      "Migration notes for Vue TUI 1.0 release candidate entrypoints, root exports, CLI APIs, and component contract changes.",
    keywords: "Vue TUI migration, package migration, terminal UI API changes",
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
  const keywords = meta.keywords?.split(",").map((keyword) => keyword.trim());
  const base = {
    "@context": "https://schema.org",
    "@type": meta.schemaType ?? "TechArticle",
    "@id": `${url}#primary`,
    name: meta.title,
    headline: meta.title,
    description: meta.description,
    url,
    image: meta.image ?? siteImage,
    inLanguage: "zh-CN",
    author: {
      "@type": "Person",
      name: "Simon He",
      url: "https://github.com/Simon-He95",
    },
    publisher: {
      "@type": "Organization",
      name: siteName,
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: siteImage,
        width: 1448,
        height: 1086,
      },
    },
    ...(keywords ? { keywords } : {}),
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
            alternateName: packageName,
            codeRepository: githubUrl,
            programmingLanguage: "TypeScript",
            runtimePlatform: ["Browser DOM", "Node.js CLI stdout"],
            applicationCategory: "DeveloperApplication",
            softwareRequirements: ["Vue >=3.3.0 <4", "Node.js >=16.17"],
            license: `${githubUrl}/blob/main/license`,
            installUrl: npmUrl,
            sameAs: [npmUrl, githubUrl],
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
    ["meta", { property: "og:locale", content: "zh_CN" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:image", content: siteImage }],
    ["meta", { property: "og:image:alt", content: "Vue TUI logo" }],
    ["meta", { property: "og:image:width", content: "1448" }],
    ["meta", { property: "og:image:height", content: "1086" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: pageMeta["index.md"].title }],
    ["meta", { name: "twitter:description", content: siteDescription }],
    ["meta", { name: "twitter:image", content: siteImage }],
    ["meta", { name: "twitter:image:alt", content: "Vue TUI logo" }],
    ["meta", { name: "theme-color", content: "#111827" }],
    ["link", { rel: "alternate", type: "text/plain", title: "LLMs.txt", href: "/llms.txt" }],
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
    const image = meta.image ?? siteImage;
    const imageAlt = meta.imageAlt ?? "Vue TUI logo";
    const imageWidth = meta.imageWidth ?? "1448";
    const imageHeight = meta.imageHeight ?? "1086";
    const isHome = page === "index.md";
    const head: HeadConfig[] = [
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:url", content: url }],
      ["meta", { property: "og:type", content: isHome ? "website" : "article" }],
      ["meta", { property: "og:title", content: meta.title }],
      ["meta", { property: "og:description", content: meta.description }],
      ["meta", { property: "og:image", content: image }],
      ["meta", { property: "og:image:alt", content: imageAlt }],
      ["meta", { property: "og:image:width", content: imageWidth }],
      ["meta", { property: "og:image:height", content: imageHeight }],
      ["meta", { name: "twitter:title", content: meta.title }],
      ["meta", { name: "twitter:description", content: meta.description }],
      ["meta", { name: "twitter:image", content: image }],
      ["meta", { name: "twitter:image:alt", content: imageAlt }],
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
