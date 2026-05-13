export type { StdoutRenderer, ThemePalette } from "./cli/stdout-renderer.js";
export { createStdoutRenderer } from "./cli/stdout-renderer.js";
export type { RendererCapabilities, TerminalRendererLike } from "./capabilities.js";
export {
  DOM_RENDERER_CAPABILITIES,
  HEADLESS_RENDERER_CAPABILITIES,
  STDOUT_RENDERER_CAPABILITIES,
} from "./capabilities.js";

export type {
  CellMetrics,
  DomRenderer,
  DomRendererAccessibilityOptions,
  DomRendererAccessibilityRole,
  DomRendererDebugStats,
  DomRendererFlushSample,
  DomRendererFlushStats,
  DomRendererLinkOptions,
  DomRendererOptions,
  DomRendererRowKeyPrepassDebugStats,
  DomRendererRowKeyPrepassDecision,
  DomRendererRowKeyPrepassMode,
  DomRendererRowRenderDebugStats,
  DomRendererRowRenderStats,
  DomRendererSyncFlushDecision,
  DomRendererSyncFlushStats,
} from "./dom/dom-renderer.js";
export { createDomRenderer } from "./dom/dom-renderer.js";
