import { defineComponent, h } from "vue";
import {
  TMermaidText as TBaseMermaidText,
  isSimpleMermaidFlowchartSource,
  markMermaidRenderErrorFatal,
  tMermaidTextProps,
  type TMermaidCopyPayload,
  type TMermaidRenderer,
  type TMermaidTransientErrorClassifier,
} from "../components/TMermaidText.js";

const BEAUTIFUL_MERMAID_INSTALL_HINT =
  "Install beautiful-mermaid and use TMermaidText from @simon_he/vue-tui/mermaid or @simon_he/vue-tui/agent/mermaid, or pass a custom renderer prop.";

const MISSING_BEAUTIFUL_MERMAID_ERROR_CODE = "VUE_TUI_MISSING_BEAUTIFUL_MERMAID";
const INVALID_BEAUTIFUL_MERMAID_EXPORT_ERROR_CODE = "VUE_TUI_INVALID_BEAUTIFUL_MERMAID_EXPORT";

type BeautifulMermaidModule = Readonly<{
  renderMermaidASCII?: unknown;
  renderMermaidAscii?: unknown;
  default?: unknown;
}>;

let cachedBeautifulMermaid: Promise<BeautifulMermaidModule> | null = null;

function functionValue(value: unknown): TMermaidRenderer | null {
  return typeof value === "function" ? (value as TMermaidRenderer) : null;
}

function functionProp(target: unknown, key: string): TMermaidRenderer | null {
  if (!target || typeof target !== "object") return null;
  if (!(key in target)) return null;
  const value = (target as Record<string, unknown>)[key];
  return typeof value === "function" ? (value as TMermaidRenderer) : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function codedError(message: string, code: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function missingBeautifulMermaidError(error: unknown): Error {
  if (
    error &&
    typeof error === "object" &&
    errorCode(error) === MISSING_BEAUTIFUL_MERMAID_ERROR_CODE
  ) {
    return markMermaidRenderErrorFatal(error);
  }

  const detail = errorMessage(error);
  return markMermaidRenderErrorFatal(
    codedError(
      `${BEAUTIFUL_MERMAID_INSTALL_HINT} (${detail})`,
      MISSING_BEAUTIFUL_MERMAID_ERROR_CODE,
    ),
  );
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : "";
}

function errorCause(error: unknown): unknown {
  if (!error || typeof error !== "object") return undefined;
  return (error as { cause?: unknown }).cause;
}

export function isMissingBeautifulMermaid(error: unknown): boolean {
  return isMissingBeautifulMermaidWithSeen(error, new WeakSet<object>());
}

function isMissingBeautifulMermaidWithSeen(error: unknown, seen: WeakSet<object>): boolean {
  if (error && typeof error === "object") {
    if (seen.has(error)) return false;
    seen.add(error);
  }

  const message = errorMessage(error);
  const code = errorCode(error);

  if (code === MISSING_BEAUTIFUL_MERMAID_ERROR_CODE) {
    return true;
  }

  const mentionsBeautifulMermaid =
    /Cannot find package ['"]beautiful-mermaid['"]/.test(message) ||
    /Cannot find module ['"]beautiful-mermaid['"]/.test(message) ||
    /Cannot resolve module ['"]beautiful-mermaid['"]/.test(message) ||
    /Can't resolve ['"]beautiful-mermaid['"]/.test(message) ||
    /Failed to resolve module specifier ['"]beautiful-mermaid['"]/.test(message) ||
    /Failed to resolve import ['"]beautiful-mermaid['"]/.test(message) ||
    /Could not resolve ['"]beautiful-mermaid['"]/.test(message);

  if (
    mentionsBeautifulMermaid &&
    (code === "" ||
      code === "ERR_MODULE_NOT_FOUND" ||
      code === "MODULE_NOT_FOUND" ||
      code === "UNRESOLVED_IMPORT")
  ) {
    return true;
  }

  const cause = errorCause(error);
  return cause !== undefined && isMissingBeautifulMermaidWithSeen(cause, seen);
}

function resolveBeautifulMermaidRenderer(mod: BeautifulMermaidModule): TMermaidRenderer {
  const renderer =
    functionProp(mod, "renderMermaidASCII") ??
    functionProp(mod, "renderMermaidAscii") ??
    functionValue(mod.default) ??
    functionProp(mod.default, "renderMermaidASCII") ??
    functionProp(mod.default, "renderMermaidAscii");

  if (!renderer) {
    throw markMermaidRenderErrorFatal(
      codedError(
        "beautiful-mermaid is installed but does not export renderMermaidASCII.",
        INVALID_BEAUTIFUL_MERMAID_EXPORT_ERROR_CODE,
      ),
    );
  }

  return renderer;
}

function hasErrorCode(error: unknown, code: string, seen = new WeakSet<object>()): boolean {
  if (!error || typeof error !== "object") return false;
  if (seen.has(error)) return false;
  seen.add(error);

  if (errorCode(error) === code) return true;

  const cause = errorCause(error);
  return cause !== undefined && hasErrorCode(cause, code, seen);
}

function isBeautifulMermaidExportError(error: unknown): boolean {
  return hasErrorCode(error, INVALID_BEAUTIFUL_MERMAID_EXPORT_ERROR_CODE);
}

const isTransientBeautifulMermaidRenderError: TMermaidTransientErrorClassifier = (error) => {
  if (isMissingBeautifulMermaid(error)) return false;
  if (isBeautifulMermaidExportError(error)) return false;
  return true;
};

async function loadBeautifulMermaid(): Promise<BeautifulMermaidModule> {
  if (!cachedBeautifulMermaid) {
    cachedBeautifulMermaid = import("beautiful-mermaid")
      .then((mod) => mod as BeautifulMermaidModule)
      .catch((error) => {
        cachedBeautifulMermaid = null;
        if (isMissingBeautifulMermaid(error)) {
          throw missingBeautifulMermaidError(error);
        }
        throw markMermaidRenderErrorFatal(error);
      });
  }
  return cachedBeautifulMermaid;
}

export const beautifulMermaidRenderer: TMermaidRenderer = async (code, options) => {
  try {
    const mod = await loadBeautifulMermaid();
    const renderer = resolveBeautifulMermaidRenderer(mod);
    return await renderer(code, options);
  } catch (error) {
    if (isMissingBeautifulMermaid(error)) {
      throw missingBeautifulMermaidError(error);
    }
    throw error;
  }
};

export function createBeautifulMermaidRenderer(): TMermaidRenderer {
  return beautifulMermaidRenderer;
}

export const TMermaidText = defineComponent({
  name: "TMermaidText",
  inheritAttrs: false,
  props: tMermaidTextProps,
  emits: {
    copy: (_payload: TMermaidCopyPayload) => true,
  },
  setup(props, { attrs, emit, slots }) {
    return () => {
      const renderer = props.renderer ?? beautifulMermaidRenderer;
      const shouldRenderSource =
        props.shouldRenderSource ??
        (props.renderer ? undefined : isSimpleMermaidFlowchartSource);

      return h(
        TBaseMermaidText,
        {
          ...attrs,
          ...props,
          renderer,
          isTransientError: props.isTransientError ?? isTransientBeautifulMermaidRenderError,
          shouldRenderSource,
          onCopy: (payload: TMermaidCopyPayload) => emit("copy", payload),
        },
        slots,
      );
    };
  },
});

export const TMermaid = TMermaidText;
export const TBeautifulMermaidText = TMermaidText;
export const TBeautifulMermaid = TMermaidText;
