import type { ComputedRef, Ref } from "vue";
import type { PathPickMode } from "../../../../cli/path-suggest.js";
import type { TerminalRenderPlane } from "../../../../core/render-plane.js";
import type { Style, Terminal } from "../../../../core/types.js";
import type { Rect, TerminalKeyboardEvent } from "../../../../events/index.js";
import type { TerminalScheduler } from "../../../context.js";
import type { TInputHostAdapter } from "../host.js";

export type PromptSuggestion = Readonly<{
  value: string;
  insert?: string;
  label?: string;
  detail?: string;
  keywords?: readonly string[];
  mentionValue?: string;
  mentionBehavior?: "collect" | "inline";
  onSelect?: (info: Readonly<{ value: string; query: string }>) => void | boolean;
}>;

export type TInputPluginContext = Readonly<{
  getProps: () => Readonly<{
    zIndex: number;
    style?: Style;

    promptSuggestions: readonly PromptSuggestion[];
    promptTrigger: string;
    promptTriggers?: readonly string[];
    promptMaxItems: number;
    promptAlign: "input" | "center";
    promptSelectedStyle?: Style;
    promptPopupStyle?: Style;
    promptPopupBorderStyle?: Style;
    promptPopupMatchStyle?: Style;

    mentionTrigger: string;
    mentionWorkspace: string;
    mentionMode: PathPickMode;
    mentionShowHidden: boolean;
    mentionSuggestions: readonly PromptSuggestion[];
    mentionMaxItems: number;
    mentionChipStyle?: Style;
    collectMentions: boolean;
    mentions: readonly string[];

    skillTrigger?: string;
    skillSuggestions?: readonly PromptSuggestion[];
  }>;
  emit: (event: string, ...args: any[]) => void;

  terminal: Terminal;
  scheduler: TerminalScheduler;
  defaultStyle: Ref<Style>;
  render: Readonly<{
    rootStack: any;
    createStack: (parent: any, z: number) => any;
    invalidatePlane: (plane: TerminalRenderPlane) => void;
  }>;

  visible: Ref<boolean>;
  rawAbsRect: ComputedRef<Rect>;
  eventZ: ComputedRef<number>;

  focused: Ref<boolean>;
  cursor: Ref<number>;

  getValue: () => string;
  insertText: (text: string) => void;
  pushUndoSnapshot: (nextValue: string) => void;
  applyEdit: (nextValue: string, nextCursor: number) => void;

  registerKeydownInterceptor: (fn: (e: TerminalKeyboardEvent) => boolean) => void;
  registerTextFilter: (
    fn: (
      info: Readonly<{
        text: string;
        value: string;
        cursor: number;
        selection: null | Readonly<{ start: number; end: number }>;
      }>,
    ) => string,
  ) => void;
  registerChipStyleProvider: (
    provider: Readonly<{
      getStyle: (
        baseStyle: Style,
        chip: Readonly<{ kind: "multiline" | "mention"; absPath?: string }>,
      ) => Style | null | undefined;
      version: Ref<number>;
    }> | null,
  ) => void;
  registerHostAdapter: (adapter: TInputHostAdapter | null) => void;
  resolvePath: (input: string, opts?: Readonly<{ preserveBackslash?: boolean }>) => string;

  mentionToken: string;
}>;

export type TInputPlugin = Readonly<{
  name: string;
  install: (ctx: TInputPluginContext) => void;
}>;
