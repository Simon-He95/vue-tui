import { defineComponent, h } from "vue";
import {
  TMermaidText as TBaseMermaidText,
  tMermaidTextProps,
  type TMermaidRenderer,
} from "../components/TMermaidText.js";

const BEAUTIFUL_MERMAID_INSTALL_HINT =
  "Install beautiful-mermaid to use @simon_he/vue-tui/mermaid, or pass a custom renderer prop.";

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingBeautifulMermaid(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    message.includes("beautiful-mermaid") ||
    message.includes("ERR_MODULE_NOT_FOUND") ||
    message.includes("Cannot find package") ||
    message.includes("Cannot find module") ||
    message.includes("Failed to resolve module specifier") ||
    message.includes("Failed to fetch dynamically imported module")
  );
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
        if (isMissingBeautifulMermaid(error)) {
          const detail = errorMessage(error);
          throw new Error(`${BEAUTIFUL_MERMAID_INSTALL_HINT} (${detail})`);
        }
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

export const TMermaidText = defineComponent({
  name: "TMermaidText",
  props: tMermaidTextProps,
  setup(props, { slots }) {
    return () =>
      h(
        TBaseMermaidText,
        {
          ...props,
          renderer: props.renderer ?? beautifulMermaidRenderer,
        },
        slots,
      );
  },
});

export const TMermaid = TMermaidText;
export const TBeautifulMermaidText = TMermaidText;
export const TBeautifulMermaid = TMermaidText;
