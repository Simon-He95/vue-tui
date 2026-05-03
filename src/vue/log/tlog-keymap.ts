export type TLogKeymap = Readonly<{
  searchNext?: readonly string[];
  searchPrevious?: readonly string[];
  clearSearch?: readonly string[];
  nextLink?: readonly string[];
  previousLink?: readonly string[];
  activateLink?: readonly string[];
}>;

type KeyboardLike = Readonly<{
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  preventDefault?: () => void;
}>;

export const tlogDefaultKeymap: TLogKeymap = Object.freeze({
  searchNext: Object.freeze(["f3", "ctrl+g"]),
  searchPrevious: Object.freeze(["shift+f3", "ctrl+shift+g"]),
  clearSearch: Object.freeze(["escape"]),
  nextLink: Object.freeze(["tab"]),
  previousLink: Object.freeze(["shift+tab"]),
  activateLink: Object.freeze(["enter"]),
});

export const tlogHighContrastKeymap: TLogKeymap = Object.freeze({
  ...tlogDefaultKeymap,
  clearSearch: Object.freeze(["ctrl+l", "escape"]),
});

function normalizeKeyToken(token: string): string {
  return token.trim().toLowerCase();
}

function eventSignature(event: KeyboardLike): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.metaKey) parts.push("meta");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(normalizeKeyToken(event.key));
  return parts.join("+");
}

export function matchesTLogKeyBinding(
  event: KeyboardLike,
  bindings: readonly string[] | undefined,
): boolean {
  if (!bindings?.length) return false;
  const signature = eventSignature(event);
  return bindings.some((binding) => normalizeKeyToken(binding) === signature);
}

export function handleTLogKeymapEvent(
  event: KeyboardLike,
  keymap: TLogKeymap,
  actions: Readonly<{
    searchNext?: () => void;
    searchPrevious?: () => void;
    clearSearch?: () => void;
    nextLink?: () => boolean;
    previousLink?: () => boolean;
    activateLink?: () => boolean;
  }>,
): boolean {
  if (matchesTLogKeyBinding(event, keymap.searchNext)) {
    actions.searchNext?.();
    event.preventDefault?.();
    return true;
  }
  if (matchesTLogKeyBinding(event, keymap.searchPrevious)) {
    actions.searchPrevious?.();
    event.preventDefault?.();
    return true;
  }
  if (matchesTLogKeyBinding(event, keymap.clearSearch)) {
    actions.clearSearch?.();
    event.preventDefault?.();
    return true;
  }
  if (matchesTLogKeyBinding(event, keymap.nextLink)) {
    const handled = actions.nextLink?.() === true;
    if (handled) event.preventDefault?.();
    return handled;
  }
  if (matchesTLogKeyBinding(event, keymap.previousLink)) {
    const handled = actions.previousLink?.() === true;
    if (handled) event.preventDefault?.();
    return handled;
  }
  if (matchesTLogKeyBinding(event, keymap.activateLink)) {
    const handled = actions.activateLink?.() === true;
    if (handled) event.preventDefault?.();
    return handled;
  }
  return false;
}
