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

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : "";
}

export function isMissingBeautifulMermaid(error: unknown): boolean {
  const message = errorMessage(error);
  const code = errorCode(error);

  return (
    (code === "ERR_MODULE_NOT_FOUND" &&
      /Cannot find package ['"]beautiful-mermaid['"]/.test(message)) ||
    /Cannot find module ['"]beautiful-mermaid['"]/.test(message) ||
    /Failed to resolve module specifier ['"]beautiful-mermaid['"]/.test(message) ||
    /Failed to resolve import ['"]beautiful-mermaid['"]/.test(message) ||
    /Could not resolve ['"]beautiful-mermaid['"]/.test(message)
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
