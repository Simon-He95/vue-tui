export type RendererCapabilities = Readonly<{
  syncFlush: boolean;
  scrollOperations: boolean;
  domRows: boolean;
}>;

export type TerminalRendererLike = Readonly<{
  capabilities: RendererCapabilities;
  container?: HTMLElement;
  debugStats?: unknown;
}>;

export const DOM_RENDERER_CAPABILITIES: RendererCapabilities = Object.freeze({
  syncFlush: true,
  scrollOperations: true,
  domRows: true,
});

export const HEADLESS_RENDERER_CAPABILITIES: RendererCapabilities = Object.freeze({
  syncFlush: false,
  scrollOperations: true,
  domRows: false,
});

export const STDOUT_RENDERER_CAPABILITIES: RendererCapabilities = Object.freeze({
  syncFlush: true,
  scrollOperations: true,
  domRows: false,
});
