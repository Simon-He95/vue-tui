import type {
  TerminalSelectionCopyPayload,
  TerminalSelectionOptions,
} from "../../../selection/terminal-selection.js";
import type { Style } from "../../../core/types.js";

export type ResolvedTerminalSelectionConfig = Readonly<{
  enabled: boolean;
  autoCopy: boolean;
  copyOnMouseUp: boolean;
  style: Style;
  toast: boolean;
}>;

export type TerminalProviderSelectionOptions = TerminalSelectionOptions &
  Readonly<{
    toast?: boolean;
  }>;

export type TerminalProviderSelectionConfig = boolean | TerminalProviderSelectionOptions;

export function resolveSelectionConfig(
  config: TerminalProviderSelectionConfig,
): ResolvedTerminalSelectionConfig {
  if (config === false) {
    return {
      enabled: false,
      autoCopy: true,
      copyOnMouseUp: true,
      style: { inverse: true },
      toast: true,
    };
  }
  const value = config === true ? {} : config;
  return {
    enabled: true,
    autoCopy: value.autoCopy ?? true,
    copyOnMouseUp: value.copyOnMouseUp ?? true,
    style: value.style ?? { inverse: true },
    toast: value.toast ?? true,
  };
}

export function selectionCopyToastText(payload: TerminalSelectionCopyPayload): string {
  if (payload.ok) return `Copied ${payload.rows} ${payload.rows === 1 ? "line" : "lines"}`;
  if (payload.error instanceof Error && /unavailable/i.test(payload.error.message))
    return "Clipboard unavailable";
  return "Copy failed";
}
