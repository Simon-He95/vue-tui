import { defineComponent, h } from "vue";
import {
  TMermaidText,
  tMermaidTextProps,
  type TMermaidRenderer,
} from "../components/TMermaidText.js";

type BeautifulMermaidModule = Readonly<{
  renderMermaidASCII?: unknown;
  renderMermaidAscii?: unknown;
  default?: unknown;
}>;

let cachedBeautifulMermaid: Promise<BeautifulMermaidModule> | null = null;

function functionProp(target: unknown, key: string): TMermaidRenderer | null {
  if (!target || typeof target !== "object") return null;
  const value = (target as Record<string, unknown>)[key];
  return typeof value === "function" ? (value as TMermaidRenderer) : null;
}

function resolveBeautifulMermaidRenderer(mod: BeautifulMermaidModule): TMermaidRenderer {
  const renderer =
    functionProp(mod, "renderMermaidASCII") ??
    functionProp(mod, "renderMermaidAscii") ??
    functionProp(mod.default, "renderMermaidASCII") ??
    functionProp(mod.default, "renderMermaidAscii");

  if (!renderer) {
    throw new Error("beautiful-mermaid is installed but does not export renderMermaidASCII.");
  }

  return renderer;
}

async function loadBeautifulMermaid(): Promise<BeautifulMermaidModule> {
  if (!cachedBeautifulMermaid) {
    cachedBeautifulMermaid = import("beautiful-mermaid")
      .then((mod) => mod as BeautifulMermaidModule)
      .catch((error) => {
        cachedBeautifulMermaid = null;
        throw error;
      });
  }
  return cachedBeautifulMermaid;
}

export const beautifulMermaidRenderer: TMermaidRenderer = async (code, options) => {
  const mod = await loadBeautifulMermaid();
  const renderer = resolveBeautifulMermaidRenderer(mod);
  return renderer(code, options);
};

export function createBeautifulMermaidRenderer(): TMermaidRenderer {
  return beautifulMermaidRenderer;
}

export const TBeautifulMermaidText = defineComponent({
  name: "TBeautifulMermaidText",
  props: tMermaidTextProps,
  setup(props, { slots }) {
    return () =>
      h(
        TMermaidText,
        {
          ...props,
          renderer: props.renderer ?? beautifulMermaidRenderer,
        },
        slots,
      );
  },
});

export const TBeautifulMermaid = TBeautifulMermaidText;
