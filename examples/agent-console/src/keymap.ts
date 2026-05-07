import type { TerminalKeyboardEvent } from "@simon_he/vue-tui";

export type AgentConsoleKeymapActions = Readonly<{
  inputFocused: () => boolean;
  overlayOpen: () => boolean;
  closeOverlay: () => void;
  openSearch: () => void;
  openPalette: () => void;
  openLinks: () => void;
  jumpToBottom: () => void;
  toggleMode: () => void;
  focusNextLink: () => boolean;
}>;

export function handleAgentConsoleKeymap(
  event: TerminalKeyboardEvent,
  actions: AgentConsoleKeymapActions,
): void {
  if (event.key === "Escape" && actions.overlayOpen()) {
    event.preventDefault();
    actions.closeOverlay();
    return;
  }

  if (event.ctrlKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    actions.openPalette();
    return;
  }

  if (event.ctrlKey && event.key.toLowerCase() === "l") {
    event.preventDefault();
    actions.openLinks();
    return;
  }

  if (event.ctrlKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    actions.openSearch();
    return;
  }

  if (event.key === "/" && !event.ctrlKey && !event.metaKey && !actions.inputFocused()) {
    event.preventDefault();
    actions.openSearch();
    return;
  }

  if (event.key === "End" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    actions.jumpToBottom();
    return;
  }

  if (event.key === "F2") {
    event.preventDefault();
    actions.toggleMode();
    return;
  }

  if (event.key === "Tab" && !event.shiftKey && !actions.inputFocused() && !actions.overlayOpen()) {
    if (actions.focusNextLink()) event.preventDefault();
  }
}
