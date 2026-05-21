export type { TInputHostAdapter } from "./components/input/host.js";
export { createTInputHostPlugin } from "./components/input/plugins/hostPlugin.js";
export { createPromptMentionPlugin } from "./components/input/plugins/promptMentionPlugin.js";
export type {
  MentionPathProvider,
  MentionSuggestionProvider,
  PromptMentionPluginOptions,
} from "./components/input/plugins/promptMentionPlugin.js";
export { createTextRestrictionPlugin } from "./components/input/plugins/restrictText.js";
export type {
  PromptSuggestion,
  TInputPlugin,
  TInputPluginContext,
} from "./components/input/plugins/types.js";
export { TAnchor } from "./components/TAnchor.js";
export { TBox } from "./components/TBox.js";
export { TDebugOverlay } from "./components/TDebugOverlay.js";
export { TDialog } from "./components/TDialog.js";
export type {
  TerminalProviderSelectionConfig,
  TerminalProviderSelectionOptions,
} from "./components/TerminalProvider.js";
export { TerminalProvider } from "./components/TerminalProvider.js";
export { TFlow } from "./components/TFlow.js";
export { TInput } from "./components/TInput.js";
export { TInputBox } from "./components/TInputBox.js";
export { lintJsonText, TJsonEditor } from "./components/TJsonEditor.js";
export { TList } from "./components/TList.js";
export { TLink } from "./components/TLink.js";
export { TLinkifyText } from "./components/TLinkifyText.js";
export type {
  TLinkActivatePayload,
  TLinkActivationSource,
  TLinkInvalidHrefPayload,
  TLinkModifierClick,
  TLinkOpenMode,
  TLinkOpenPayload,
} from "./components/TLink.js";
export type {
  TerminalLinkOpenContext,
  TerminalLinkOpener,
  TerminalLinkOpenerLike,
  TerminalLinkOpenSource,
} from "./components/link/host.js";
export {
  linkifyTextSegments,
  type TLinkifyOptions,
  type TLinkifyProtocol,
  type TLinkifySegment,
} from "./linkify.js";
export { TMultilineModal } from "./components/TMultilineModal.js";
export { TPathPicker } from "./components/TPathPicker.js";
export { TRenderLayer } from "./components/TRenderLayer.js";
export { TRenderPlane } from "./components/TRenderPlane.js";
export { TSelect } from "./components/TSelect.js";
export type {
  SelectOption,
  TSelectMultipleChangePayload,
  TSelectMultipleEmitMode,
} from "./components/TSelect.js";
export { TText } from "./components/TText.js";
export { TTransition } from "./components/TTransition.js";
export { TView } from "./components/TView.js";

export { useLayout } from "./composables/use-layout.js";
export { useRenderNode } from "./composables/use-render-node.js";
export { useTerminalRuntime } from "./composables/use-runtime.js";
export { useTerminalNode } from "./composables/use-terminal-node.js";
export { useTerminal } from "./composables/use-terminal.js";
export { useVisibility } from "./composables/use-visibility.js";
export type { TuiMarkdownTheme, TuiMarkdownThemeOverrides } from "./markdown/theme.js";

export type {
  LayoutContext,
  TerminalFrameContext,
  TerminalFrameTask,
  TerminalFrameTaskPriority,
  TerminalContext,
  TerminalSelectionContext,
  TerminalRuntime,
  TerminalRuntimeHandle,
  TerminalScheduler,
  TerminalSchedulerConfig,
  TerminalSchedulerInvalidateOptions,
} from "./context.js";
export { TInputPluginsContextKey } from "./context.js";
export { useRoute, useRouter } from "./router/composables.js";
export { createTerminalRouter } from "./router/router.js";

export { TRouterView } from "./router/RouterView.js";

export type {
  TerminalRoute,
  TerminalRouteLocationRaw,
  TerminalRouter,
  TerminalRouteRecord,
} from "./router/types.js";
